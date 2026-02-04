import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';
import type { AnswerDraft, CompanyData, MatchResult, DataContext } from '../types';

// We test the internal logic by importing the module and mocking XLSX.writeFile
vi.mock('xlsx', async () => {
  const actual = await vi.importActual<typeof XLSX>('xlsx');
  return { ...actual, writeFile: vi.fn() };
});

import { exportToExcel } from '../excelExporter';

const mockMatch: MatchResult = {
  questionId: 'q1', primaryDomain: 'emissions', secondaryDomains: [],
  topics: ['ghg_emissions'], confidence: 'high', matchedKeywords: [], suggestedDataPoints: [],
};

const mockContext: DataContext = {
  company: [], operational: [], calculated: [],
  metadata: { reportingPeriod: '2024', sitesIncluded: [], dataGaps: [] },
};

function makeDraft(overrides: Partial<AnswerDraft> = {}): AnswerDraft {
  return {
    questionId: 'q1', questionText: 'What are your emissions?',
    category: 'Environment', matchResult: mockMatch, dataContext: mockContext,
    answer: 'Our emissions were 100 tCO2e.', answerConfidence: 'high',
    confidenceSource: 'provided', evidence: '', metricKeysUsed: ['emissions.scope1_tco2e_12m'],
    needsReview: false, isEstimate: false, hasDataGaps: false,
    ...overrides,
  };
}

const company: CompanyData = {
  companyName: 'Test Corp', industry: 'Manufacturing', country: 'Germany',
  employeeCount: 100, numberOfSites: 1, reportingPeriod: '2024', revenueBand: '',
};

describe('exportToExcel', () => {
  beforeEach(() => {
    vi.mocked(XLSX.writeFile).mockClear();
  });

  it('creates a workbook with 4 sheets', () => {
    const drafts = [makeDraft()];
    exportToExcel({ answerDrafts: drafts, companyData: company, questionnaireName: 'test' });

    expect(XLSX.writeFile).toHaveBeenCalled();
    const call = (XLSX.writeFile as ReturnType<typeof vi.fn>).mock.calls[0];
    const wb = call[0] as XLSX.WorkBook;
    expect(wb.SheetNames).toEqual(['Executive Summary', 'Methodology', 'Answers', 'Review Checklist']);
  });

  it('includes answer data in Answers sheet', () => {
    const drafts = [makeDraft(), makeDraft({ questionId: 'q2', questionText: 'Water usage?', confidenceSource: 'unknown' })];
    exportToExcel({ answerDrafts: drafts, companyData: company, questionnaireName: 'test' });

    const call = (XLSX.writeFile as ReturnType<typeof vi.fn>).mock.calls[0];
    const wb = call[0] as XLSX.WorkBook;
    const answersSheet = wb.Sheets['Answers'];
    const data = XLSX.utils.sheet_to_json<Record<string, string>>(answersSheet);
    expect(data.length).toBe(2);
    expect(data[0]['Question']).toBe('What are your emissions?');
    expect(data[0]['Confidence']).toBe('Provided');
    expect(data[1]['Confidence']).toBe('Unknown');
  });

  it('maps confidence labels correctly', () => {
    const drafts = [
      makeDraft({ confidenceSource: 'provided' }),
      makeDraft({ questionId: 'q2', confidenceSource: 'estimated' }),
      makeDraft({ questionId: 'q3', confidenceSource: 'unknown' }),
    ];
    exportToExcel({ answerDrafts: drafts, companyData: company, questionnaireName: 'test' });

    const call = (XLSX.writeFile as ReturnType<typeof vi.fn>).mock.calls[0];
    const wb = call[0] as XLSX.WorkBook;
    const data = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets['Answers']);
    expect(data.map(d => d['Confidence'])).toEqual(['Provided', 'Estimated', 'Unknown']);
  });

  it('uses correct filename', () => {
    exportToExcel({ answerDrafts: [makeDraft()], companyData: company, questionnaireName: 'my_questionnaire' });
    const call = (XLSX.writeFile as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1]).toBe('my_questionnaire_responses.xlsx');
  });
});
