import { describe, it, expect } from 'vitest';
import { generateAnswerDraft } from '../answerGenerator';
import { matchQuestion } from '../keywordMatcher';
import { retrieveDataForCompany } from '../dataRetrieval';
import type { CompanyData, GenerationConfig, ParsedQuestion } from '../types';

const config: GenerationConfig = {
  useLLM: false, includeMethodology: true, includeAssumptions: true,
  includeLimitations: true, verbosity: 'standard', aggregateSites: true,
};

const fullCompany: CompanyData = {
  companyName: 'Acme Corp', industry: 'Manufacturing', country: 'Germany',
  employeeCount: 500, numberOfSites: 3, reportingPeriod: 'Jan 2024 - Dec 2024', revenueBand: '10M-50M EUR',
  electricityKwh: 1000000, renewablePercent: 40, naturalGasM3: 50000, dieselLiters: 10000,
  waterM3: 5000, totalWasteKg: 200000, recyclingPercent: 65, hazardousWasteKg: 5000,
  femalePercent: 35, trainingHoursPerEmployee: 20, trirRate: 1.5, lostTimeIncidents: 3, fatalities: 0,
  certifications: 'ISO 14001, ISO 45001', sustainabilityGoal: 'Net zero by 2035',
};

const emptyCompany: CompanyData = {
  companyName: 'Empty Corp', industry: '', country: '', employeeCount: 0,
  numberOfSites: 1, reportingPeriod: '', revenueBand: '',
};

function q(text: string): ParsedQuestion {
  return { id: 'q1', rowIndex: 1, text, rawRow: {} };
}

function draft(text: string, company: CompanyData = fullCompany) {
  const question = q(text);
  const match = matchQuestion(question);
  const ctx = retrieveDataForCompany(match, company);
  return generateAnswerDraft(question, match, ctx, config);
}

describe('confidenceSource field', () => {
  it('sets provided when data is available', () => {
    const d = draft('What is your total electricity consumption?');
    expect(d.confidenceSource).toBe('provided');
  });

  it('sets estimated when data is calculated', () => {
    const c = { ...fullCompany, scope1Tco2e: undefined, scope2Tco2e: undefined };
    const d = draft('What are your GHG emissions?', c);
    expect(d.confidenceSource).toBe('estimated');
  });

  it('sets unknown when no data at all', () => {
    // Use a company with truly no name so even company context fallback is empty
    const noNameCompany: CompanyData = {
      companyName: '', industry: '', country: '', employeeCount: 0,
      numberOfSites: 1, reportingPeriod: '', revenueBand: '',
    };
    const d = draft('What is your total waste generated?', noNameCompany);
    expect(d.confidenceSource).toBe('unknown');
  });
});

describe('evidence field', () => {
  it('initializes evidence as empty string', () => {
    const d = draft('What are your emissions?');
    expect(d.evidence).toBe('');
  });
});

describe('metricKeysUsed field', () => {
  it('includes metric keys for energy questions', () => {
    const d = draft('What is your total electricity consumption?');
    expect(d.metricKeysUsed).toBeDefined();
    expect(Array.isArray(d.metricKeysUsed)).toBe(true);
  });
});

describe('unknown handling', () => {
  it('sets confidenceSource to unknown when no relevant data', () => {
    // emptyCompany has companyName so some company data is returned,
    // but for a purely operational question with no data, we get 'unknown'
    const noDataCompany: CompanyData = {
      companyName: '', industry: '', country: '', employeeCount: 0,
      numberOfSites: 1, reportingPeriod: '', revenueBand: '',
    };
    const d = draft('What is your total waste generated?', noDataCompany);
    // With no company name and no waste data, should be unknown
    expect(d.confidenceSource).toBe('unknown');
    expect(d.answer).toContain('Unknown');
  });
});

describe('country-specific emissions', () => {
  // Use direct match result to ensure emissions domain is matched
  const emissionsMatch: import('../types').MatchResult = {
    questionId: 'q1', primaryDomain: 'emissions', secondaryDomains: [],
    topics: ['ghg_emissions', 'scope_2'], confidence: 'high', matchedKeywords: ['emissions', 'scope'], suggestedDataPoints: [],
  };

  it('produces different Scope 2 for Germany vs France', () => {
    const de = { ...fullCompany, country: 'Germany', scope2Tco2e: undefined };
    const fr = { ...fullCompany, country: 'France', scope2Tco2e: undefined };

    const ctxDE = retrieveDataForCompany(emissionsMatch, de);
    const ctxFR = retrieveDataForCompany(emissionsMatch, fr);

    const s2DE = ctxDE.calculated.find(p => p.field === 'scope2Location');
    const s2FR = ctxFR.calculated.find(p => p.field === 'scope2Location');

    expect(s2DE).toBeDefined();
    expect(s2FR).toBeDefined();
    // Germany has much higher grid factor than France
    expect(s2DE!.value).toBeGreaterThan(s2FR!.value as number);
  });

  it('includes country source in label', () => {
    const c = { ...fullCompany, scope2Tco2e: undefined };
    const ctx = retrieveDataForCompany(emissionsMatch, c);
    const s2 = ctx.calculated.find(p => p.field === 'scope2Location');
    expect(s2).toBeDefined();
    expect(s2!.label).toContain('Germany');
    expect(s2!.label).toContain('IEA');
  });
});
