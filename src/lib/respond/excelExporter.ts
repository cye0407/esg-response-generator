import * as XLSX from 'xlsx';
import type { AnswerDraft, CompanyData } from './types';
import { getElectricityFactor } from './emissionFactors';

// ============================================
// Excel Exporter — multi-sheet .xlsx export
// ============================================

interface ExportOptions {
  answerDrafts: AnswerDraft[];
  companyData: CompanyData;
  questionnaireName: string;
  framework?: string;
}

function mapConfidenceLabel(draft: AnswerDraft): string {
  switch (draft.confidenceSource) {
    case 'provided': return 'Provided';
    case 'estimated': return 'Estimated';
    case 'unknown': return 'Unknown';
    default:
      // Fallback from legacy answerConfidence
      if (draft.answerConfidence === 'none') return 'Unknown';
      if (draft.answerConfidence === 'low') return 'Estimated';
      if (draft.answerConfidence === 'medium' && draft.isEstimate) return 'Estimated';
      return 'Provided';
  }
}

function confidenceBreakdown(drafts: AnswerDraft[]) {
  const counts = { Provided: 0, Estimated: 0, Unknown: 0 };
  for (const d of drafts) {
    const label = mapConfidenceLabel(d) as keyof typeof counts;
    counts[label]++;
  }
  return counts;
}

function buildExecutiveSummarySheet(opts: ExportOptions): XLSX.WorkSheet {
  const { answerDrafts, companyData, questionnaireName, framework } = opts;
  const counts = confidenceBreakdown(answerDrafts);
  const total = answerDrafts.length;
  const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0;

  const rows: (string | number)[][] = [
    ['ESG Response Pack — Executive Summary'],
    [],
    ['Company:', companyData.companyName],
    ['Reporting Period:', companyData.reportingPeriod || 'Not specified'],
    ['Date Generated:', new Date().toLocaleDateString('en-GB')],
    ['Framework Detected:', framework || 'Not detected'],
    [],
    ['Questions Analyzed:', total],
    [],
    ['Confidence Breakdown:'],
    ['  Provided:', counts.Provided, `${pct(counts.Provided)}%`],
    ['  Estimated:', counts.Estimated, `${pct(counts.Estimated)}%`],
    ['  Unknown:', counts.Unknown, `${pct(counts.Unknown)}%`],
    [],
  ];

  // Top data gaps
  const unknowns = answerDrafts.filter(d => mapConfidenceLabel(d) === 'Unknown');
  if (unknowns.length > 0) {
    rows.push(['Top Data Gaps:']);
    for (const u of unknowns.slice(0, 5)) {
      rows.push([`  - ${u.questionText.slice(0, 80)}${u.questionText.length > 80 ? '...' : ''}`, '', u.category || '']);
    }
    rows.push([]);
  }

  rows.push(['Next Steps:']);
  rows.push(["1. Review all 'Estimated' answers and verify with source documents"]);
  rows.push(["2. Collect data for 'Unknown' items listed above"]);
  rows.push(['3. Add evidence references in the Answers sheet']);
  rows.push(['4. Have your team review before submission']);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 30 }, { wch: 45 }, { wch: 10 }];

  return ws;
}

function buildMethodologySheet(opts: ExportOptions): XLSX.WorkSheet {
  const { companyData, questionnaireName } = opts;
  const rows: string[][] = [
    ['METHODOLOGY STATEMENT'],
    [],
    [`Prepared for: ${companyData.companyName}`],
    [`Date: ${new Date().toLocaleDateString('en-GB')}`],
    [`Questionnaire: ${questionnaireName}`],
    [],
    ['1. DATA SOURCES'],
    [],
    [`The responses in this pack are based on operational data provided by ${companyData.companyName}`],
    [`for the reporting period ${companyData.reportingPeriod || 'not specified'}. Data was entered manually by the user`],
    ['and has not been independently verified.'],
    [],
    ['Data categories used:'],
    ['- Energy consumption (electricity, natural gas, diesel)'],
    ['- Water withdrawal'],
    ['- Waste generation and disposal'],
    ['- Workforce metrics'],
    ['- Health and safety indicators'],
    ['- Governance and certifications'],
    [],
    ['2. EMISSION CALCULATIONS'],
    [],
    ['Where Scope 1 and Scope 2 emissions were not directly provided, estimates were'],
    ['calculated using the following emission factors:'],
    [],
    ['Scope 1 (Direct):'],
    ['- Natural gas: 0.00202 tCO2e per m\u00B3'],
    ['- Diesel: 0.00268 tCO2e per litre'],
    [],
    ['Scope 2 (Indirect - Location-based):'],
    [`- Grid electricity: ${(() => { const ef = getElectricityFactor(companyData.country); return `${ef.factor} tCO2e per kWh (${ef.source})`; })()}`],
    [],
    [companyData.country
      ? `Scope 2 emission factor is based on the grid mix for ${companyData.country}.`
      : 'Note: No country was specified. A global average emission factor was used. For more accurate results, specify your country.'],
    [],
    ['3. ANSWER GENERATION'],
    [],
    ['Answers were generated using:'],
    ['- Pattern matching to identify relevant data domains for each question'],
    ['- Template-based response generation using provided data'],
    ['- AI-assisted language enhancement (where enabled)'],
    [],
    ['Confidence levels:'],
    ['- "Provided": Answer based on user-entered data'],
    ['- "Estimated": Answer includes calculated or estimated values'],
    ['- "Unknown": Insufficient data to generate a response'],
    [],
    ['4. LIMITATIONS'],
    [],
    ['- Data has not been independently verified or audited'],
    ['- Emission factors used are generic defaults; actual factors may vary by region'],
    ['- Responses are drafts intended for review before submission'],
    ['- This tool does not provide compliance or legal advice'],
    [],
    ['5. REVIEW REQUIREMENTS'],
    [],
    [`Before submitting these responses, ${companyData.companyName} should:`],
    ['1. Verify all data values against source documents'],
    ['2. Review and adjust estimated values where better data is available'],
    ['3. Confirm emission calculation methodology meets questionnaire requirements'],
    ['4. Add specific evidence references where requested'],
    ['5. Obtain appropriate internal approval'],
    [],
    ['Generated by: Ecosystems United ESG Response Generator'],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 90 }];
  return ws;
}

function buildAnswersSheet(drafts: AnswerDraft[]): XLSX.WorkSheet {
  const headers = ['QuestionID', 'Question', 'Category', 'MetricKeysUsed', 'Answer', 'Assumptions', 'Evidence', 'Confidence'];
  const data = [headers, ...drafts.map(d => [
    d.questionId,
    d.questionText,
    d.category || '',
    (d.metricKeysUsed || []).join(', '),
    d.answer,
    (d.assumptions || []).join('; '),
    d.evidence || '',
    mapConfidenceLabel(d),
  ])];

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [
    { wch: 12 },  // QuestionID
    { wch: 50 },  // Question
    { wch: 15 },  // Category
    { wch: 25 },  // MetricKeysUsed
    { wch: 60 },  // Answer
    { wch: 30 },  // Assumptions
    { wch: 30 },  // Evidence
    { wch: 12 },  // Confidence
  ];

  return ws;
}

function buildReviewChecklistSheet(drafts: AnswerDraft[]): XLSX.WorkSheet {
  const headers = ['Status', 'Item', 'Category', 'Action Required'];
  const rows: string[][] = [headers];

  // Estimated values
  const estimated = drafts.filter(d => mapConfidenceLabel(d) === 'Estimated');
  if (estimated.length > 0) {
    rows.push(['', '--- Estimated Values — Verify with Source Documents ---', '', '']);
    for (const d of estimated) {
      const text = d.questionText.length > 60 ? d.questionText.slice(0, 60) + '...' : d.questionText;
      rows.push(['\u2610', text, d.category || '', 'Verify value and update if needed']);
    }
  }

  // Unknown values
  const unknown = drafts.filter(d => mapConfidenceLabel(d) === 'Unknown');
  if (unknown.length > 0) {
    rows.push(['', '--- Unknown Values — Data Collection Needed ---', '', '']);
    for (const d of unknown) {
      const text = d.questionText.length > 60 ? d.questionText.slice(0, 60) + '...' : d.questionText;
      const action = d.promptForMissing ? `Collect data: ${d.promptForMissing}` : 'Collect required data';
      rows.push(['\u2610', text, d.category || '', action]);
    }
  }

  // Missing evidence
  const missingEvidence = drafts.filter(d => (!d.evidence || d.evidence.trim() === '') && mapConfidenceLabel(d) !== 'Unknown');
  if (missingEvidence.length > 0) {
    rows.push(['', '--- Missing Evidence — Add Source References ---', '', '']);
    for (const d of missingEvidence) {
      const text = d.questionText.length > 60 ? d.questionText.slice(0, 60) + '...' : d.questionText;
      rows.push(['\u2610', text, d.category || '', 'Add evidence reference']);
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 8 }, { wch: 65 }, { wch: 18 }, { wch: 50 }];
  return ws;
}

export function exportToExcel(opts: ExportOptions): void {
  const wb = XLSX.utils.book_new();

  const summaryWs = buildExecutiveSummarySheet(opts);
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Executive Summary');

  const methodWs = buildMethodologySheet(opts);
  XLSX.utils.book_append_sheet(wb, methodWs, 'Methodology');

  const answersWs = buildAnswersSheet(opts.answerDrafts);
  XLSX.utils.book_append_sheet(wb, answersWs, 'Answers');

  const checklistWs = buildReviewChecklistSheet(opts.answerDrafts);
  XLSX.utils.book_append_sheet(wb, checklistWs, 'Review Checklist');

  const fileName = `${opts.questionnaireName || 'questionnaire'}_responses.xlsx`;
  XLSX.writeFile(wb, fileName);
}
