import { describe, it, expect } from 'vitest';
import { generateAnswerDraft, buildLLMPrompt } from '../answerGenerator';
import { matchQuestion } from '../keywordMatcher';
import { retrieveDataForCompany } from '../dataRetrieval';
import type { CompanyData, GenerationConfig, ParsedQuestion } from '../types';

const config: GenerationConfig = {
  useLLM: false, includeMethodology: true, includeAssumptions: true,
  includeLimitations: true, verbosity: 'standard', aggregateSites: true,
};

const company: CompanyData = {
  companyName: 'Acme Corp', industry: 'Manufacturing', country: 'Germany',
  employeeCount: 500, numberOfSites: 3, reportingPeriod: 'Jan 2024 - Dec 2024', revenueBand: '10M-50M EUR',
  electricityKwh: 1000000, renewablePercent: 40, naturalGasM3: 50000, dieselLiters: 10000,
  waterM3: 5000, totalWasteKg: 200000, recyclingPercent: 65, hazardousWasteKg: 5000,
  femalePercent: 35, trainingHoursPerEmployee: 20, trirRate: 1.5, lostTimeIncidents: 3, fatalities: 0,
  certifications: 'ISO 14001, ISO 45001', sustainabilityGoal: 'Net zero by 2035',
};

function q(text: string, framework?: string): ParsedQuestion {
  return { id: 'q1', rowIndex: 1, text, framework, rawRow: {} };
}

function draft(text: string, framework?: string) {
  const question = q(text, framework);
  const match = matchQuestion(question);
  const ctx = retrieveDataForCompany(match, company);
  return generateAnswerDraft(question, match, ctx, config);
}

describe('generateAnswerDraft', () => {
  it('generates a narrative energy answer with renewable breakdown', () => {
    const d = draft('What is your total electricity consumption?');
    expect(d.answer).toContain('1,000,000');
    expect(d.answer).toContain('40%');
    expect(d.answer).toContain('kWh');
    expect(d.answer.length).toBeGreaterThan(100);
  });

  it('generates emissions answer with Scope 1 + 2', () => {
    const d = draft('What are your Scope 1 and Scope 2 GHG emissions?');
    expect(d.answer).toContain('Scope 1');
    expect(d.answer).toContain('Scope 2');
    expect(d.answer).toContain('tCO2e');
  });

  it('generates waste answer with diversion rate', () => {
    const d = draft('How much waste did your company generate and what is the recycling rate?');
    expect(d.answer).toContain('200,000');
    expect(d.answer).toContain('65%');
    expect(d.answer).toContain('kg');
  });

  it('generates H&S answer with zero fatalities narrative', () => {
    const d = draft('What is your TRIR and safety performance?');
    expect(d.answer).toContain('1.5');
    expect(d.answer).toContain('zero fatalities');
  });

  it('adds framework note when framework is detected', () => {
    const d = draft('What is your total electricity consumption?', 'CSRD');
    expect(d.answer).toContain('CSRD');
    expect(d.answer).toContain('ESRS');
  });

  it('adds GRI framework note', () => {
    const d = draft('What is your total electricity consumption?', 'GRI');
    expect(d.answer).toContain('GRI Standards');
  });

  it('returns data gaps for missing data', () => {
    const emptyCompany: CompanyData = { companyName: 'Test', industry: '', country: '', employeeCount: 0, numberOfSites: 1, reportingPeriod: '', revenueBand: '' };
    const question = q('What is your total electricity consumption?');
    const match = matchQuestion(question);
    const ctx = retrieveDataForCompany(match, emptyCompany);
    const d = generateAnswerDraft(question, match, ctx, config);
    expect(d.answerConfidence).not.toBe('high');
    expect(d.hasDataGaps).toBe(true);
  });

  it('marks estimates correctly', () => {
    // Use company without direct Scope 1, so it gets estimated
    const c = { ...company, scope1Tco2e: undefined, scope2Tco2e: undefined };
    const question = q('What are your GHG emissions?');
    const match = matchQuestion(question);
    const ctx = retrieveDataForCompany(match, c);
    const d = generateAnswerDraft(question, match, ctx, config);
    expect(d.isEstimate).toBe(true);
  });
});

describe('buildLLMPrompt', () => {
  it('includes question, data, and framework', () => {
    const question = q('What are your emissions?', 'CDP');
    const match = matchQuestion(question);
    const ctx = retrieveDataForCompany(match, company);
    const prompt = buildLLMPrompt(question, ctx, config);
    expect(prompt).toContain('What are your emissions?');
    expect(prompt).toContain('Framework: CDP');
    expect(prompt).toContain('CDP');
    expect(prompt).toContain('Available Data:');
  });
});
