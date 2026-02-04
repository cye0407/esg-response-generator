import * as XLSX from 'xlsx';
import { v4 as uuid } from 'uuid';
import type { ParsedQuestion, ParseResult, ColumnMapping } from './types';

const COLUMN_PATTERNS = {
  questionText: [
    'question', 'questions', 'query', 'text', 'description',
    'indicator', 'metric', 'requirement', 'disclosure',
    'question text', 'question_text', 'questiontext',
    'ask', 'item', 'criteria', 'criterion'
  ],
  category: [
    'category', 'topic', 'theme', 'section', 'pillar',
    'area', 'domain', 'group', 'type', 'classification'
  ],
  subcategory: [
    'subcategory', 'sub-category', 'sub_category', 'subtopic',
    'sub-topic', 'sub_topic', 'subsection', 'sub-section'
  ],
  referenceId: [
    'id', 'ref', 'reference', 'code', 'number', 'ref_id',
    'question_id', 'indicator_id', 'disclosure_id',
    'gri', 'esrs', 'sasb', 'cdp'
  ],
  required: [
    'required', 'mandatory', 'optional', 'must', 'shall'
  ]
};

const FRAMEWORK_PATTERNS: Record<string, RegExp[]> = {
  CSRD: [/csrd/i, /esrs/i, /e1\./i, /s1\./i, /g1\./i],
  GRI: [/gri\s?\d{3}/i, /gri-/i],
  CDP: [/cdp/i, /c\d+\.\d+/i],
  EcoVadis: [/ecovadis/i, /ev-/i],
  SASB: [/sasb/i],
  TCFD: [/tcfd/i],
  UN_SDG: [/sdg/i, /un sdg/i]
};

function detectColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = { questionText: '' };
  const normalizedHeaders = headers.map(h => h?.toLowerCase().trim() || '');

  for (const [field, patterns] of Object.entries(COLUMN_PATTERNS)) {
    for (let i = 0; i < normalizedHeaders.length; i++) {
      const header = normalizedHeaders[i];
      if (patterns.some(p => header.includes(p) || header === p)) {
        (mapping as unknown as Record<string, string>)[field] = headers[i];
        break;
      }
    }
  }

  if (!mapping.questionText && headers.length > 0) {
    mapping.questionText = headers[0];
  }

  return mapping;
}

function detectFramework(questions: ParsedQuestion[]): string | undefined {
  const allText = questions.map(q => `${q.text} ${q.category || ''} ${q.referenceId || ''}`).join(' ');
  for (const [framework, patterns] of Object.entries(FRAMEWORK_PATTERNS)) {
    if (patterns.some(p => p.test(allText))) return framework;
  }
  return undefined;
}

function parseRequired(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const str = String(value).toLowerCase().trim();
  if (['yes', 'y', 'true', '1', 'required', 'mandatory'].includes(str)) return true;
  if (['no', 'n', 'false', '0', 'optional'].includes(str)) return false;
  return undefined;
}

// ---------------------------------------------------------------------------
// Text-to-questions: shared by PDF and DOCX parsers
// ---------------------------------------------------------------------------

function questionsFromText(text: string, fileName: string): ParseResult {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const questions: ParsedQuestion[] = [];
  let currentCategory: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Heuristic: short lines that don't end with '?' are likely section headers
    if (line.length < 60 && !line.includes('?') && !line.match(/^\d+[\.\)]/)) {
      currentCategory = line.replace(/[:.]$/, '').trim();
      continue;
    }

    // Skip very short lines that aren't questions
    if (line.length < 10 && !line.includes('?')) continue;

    // Strip leading numbering (e.g. "1.", "1)", "Q1.", "Q1:")
    const cleaned = line.replace(/^(?:Q?\d+[\.\)\:]?\s*)/i, '').trim();
    if (!cleaned) continue;

    questions.push({
      id: uuid(),
      rowIndex: i + 1,
      text: cleaned,
      category: currentCategory,
      rawRow: { text: line },
    });
  }

  const detectedFramework = detectFramework(questions);
  if (detectedFramework) questions.forEach(q => { q.framework = detectedFramework; });

  return {
    success: questions.length > 0,
    questions,
    errors: questions.length === 0 ? ['No questions could be extracted from the document. Make sure the file contains questionnaire items.'] : [],
    metadata: {
      fileName,
      totalRows: lines.length,
      parsedRows: questions.length,
      detectedFramework,
      columnMapping: { questionText: 'text' },
    },
  };
}

// ---------------------------------------------------------------------------
// PDF parsing via pdfjs-dist
// ---------------------------------------------------------------------------

async function parsePdfFile(file: File): Promise<ParseResult> {
  try {
    const pdfjsLib = await import('pdfjs-dist');

    // Set up the worker using the bundled worker file
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const textParts: string[] = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const pageText = content.items
        .filter(item => 'str' in item)
        .map(item => (item as { str: string }).str)
        .join(' ');
      textParts.push(pageText);
    }

    const fullText = textParts.join('\n');
    return questionsFromText(fullText, file.name);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error parsing PDF';
    return {
      success: false, questions: [], errors: [`Failed to parse PDF: ${message}`],
      metadata: { fileName: file.name, totalRows: 0, parsedRows: 0, columnMapping: { questionText: '' } },
    };
  }
}

// ---------------------------------------------------------------------------
// DOCX parsing via mammoth
// ---------------------------------------------------------------------------

async function parseDocxFile(file: File): Promise<ParseResult> {
  try {
    const mammoth = await import('mammoth');
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return questionsFromText(result.value, file.name);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error parsing Word document';
    return {
      success: false, questions: [], errors: [`Failed to parse Word document: ${message}`],
      metadata: { fileName: file.name, totalRows: 0, parsedRows: 0, columnMapping: { questionText: '' } },
    };
  }
}

// ---------------------------------------------------------------------------
// Excel / CSV parsing (original logic)
// ---------------------------------------------------------------------------

function parseSheetData(
  jsonData: Record<string, unknown>[],
  columnMapping: ColumnMapping,
  sheetLabel?: string
): ParsedQuestion[] {
  const questions: ParsedQuestion[] = [];
  for (let i = 0; i < jsonData.length; i++) {
    const row = jsonData[i];
    const questionText = String(row[columnMapping.questionText] || '').trim();
    if (!questionText) continue;
    if (questionText.length < 10 && !questionText.includes('?')) continue;

    const question: ParsedQuestion = { id: uuid(), rowIndex: i + 2, text: questionText, rawRow: row };
    if (columnMapping.category) question.category = String(row[columnMapping.category] || '').trim() || undefined;
    if (!question.category && sheetLabel) question.category = sheetLabel;
    if (columnMapping.subcategory) question.subcategory = String(row[columnMapping.subcategory] || '').trim() || undefined;
    if (columnMapping.referenceId) question.referenceId = String(row[columnMapping.referenceId] || '').trim() || undefined;
    if (columnMapping.required) question.required = parseRequired(row[columnMapping.required]);
    questions.push(question);
  }
  return questions;
}

async function parseSpreadsheetFile(file: File): Promise<ParseResult> {
  const errors: string[] = [];

  try {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });

    if (workbook.SheetNames.length === 0) {
      return { success: false, questions: [], errors: ['No sheets found in file'], metadata: { fileName: file.name, totalRows: 0, parsedRows: 0, columnMapping: { questionText: '' } } };
    }

    const allQuestions: ParsedQuestion[] = [];
    let primaryMapping: ColumnMapping = { questionText: '' };
    let totalRows = 0;
    let availableColumns: string[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
      if (jsonData.length === 0) continue;

      const headers = Object.keys(jsonData[0]);
      if (availableColumns.length === 0) availableColumns = headers;

      const columnMapping = detectColumnMapping(headers);
      if (!primaryMapping.questionText && columnMapping.questionText) {
        primaryMapping = columnMapping;
      }

      if (!columnMapping.questionText) continue;

      totalRows += jsonData.length;
      const useSheetLabel = workbook.SheetNames.length > 1 ? sheetName : undefined;
      allQuestions.push(...parseSheetData(jsonData, columnMapping, useSheetLabel));
    }

    // Detection confidence
    let autoDetectionConfidence: 'high' | 'medium' | 'low' = 'high';
    if (allQuestions.length === 0) {
      autoDetectionConfidence = 'low';
    } else if (totalRows > 0 && allQuestions.length / totalRows < 0.5) {
      autoDetectionConfidence = 'medium';
    }

    if (allQuestions.length === 0 && totalRows > 0) {
      return {
        success: false, questions: [], errors: ['Could not identify question column. Try renaming the header to "Question" or use manual column mapping.'],
        metadata: { fileName: file.name, totalRows, parsedRows: 0, columnMapping: primaryMapping, availableColumns, autoDetectionConfidence },
      };
    }

    const detectedFramework = detectFramework(allQuestions);
    if (detectedFramework) allQuestions.forEach(q => { q.framework = detectedFramework; });

    return {
      success: allQuestions.length > 0, questions: allQuestions, errors,
      metadata: {
        fileName: file.name, totalRows, parsedRows: allQuestions.length,
        detectedFramework, columnMapping: primaryMapping,
        availableColumns, autoDetectionConfidence,
        sheetsProcessed: workbook.SheetNames.length,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error parsing file';
    return { success: false, questions: [], errors: [message], metadata: { fileName: file.name, totalRows: 0, parsedRows: 0, columnMapping: { questionText: '' } } };
  }
}

/**
 * Re-parse a spreadsheet file with explicit column mapping provided by the user.
 */
export async function reprocessWithMapping(file: File, manualMapping: ColumnMapping): Promise<ParseResult> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const allQuestions: ParsedQuestion[] = [];
    let totalRows = 0;

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
      if (jsonData.length === 0) continue;
      totalRows += jsonData.length;
      const useSheetLabel = workbook.SheetNames.length > 1 ? sheetName : undefined;
      allQuestions.push(...parseSheetData(jsonData, manualMapping, useSheetLabel));
    }

    const detectedFramework = detectFramework(allQuestions);
    if (detectedFramework) allQuestions.forEach(q => { q.framework = detectedFramework; });

    return {
      success: allQuestions.length > 0, questions: allQuestions,
      errors: allQuestions.length === 0 ? ['No questions found with the selected column mapping.'] : [],
      metadata: { fileName: file.name, totalRows, parsedRows: allQuestions.length, detectedFramework, columnMapping: manualMapping },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, questions: [], errors: [message], metadata: { fileName: file.name, totalRows: 0, parsedRows: 0, columnMapping: manualMapping } };
  }
}

// ---------------------------------------------------------------------------
// Main entry point — dispatches based on file extension
// ---------------------------------------------------------------------------

function getFileExtension(name: string): string {
  return name.split('.').pop()?.toLowerCase() || '';
}

export async function parseQuestionFile(file: File): Promise<ParseResult> {
  const ext = getFileExtension(file.name);

  switch (ext) {
    case 'pdf':
      return parsePdfFile(file);
    case 'docx':
      return parseDocxFile(file);
    case 'doc':
      return {
        success: false, questions: [],
        errors: ['Legacy .doc format is not supported. Please save the file as .docx and try again.'],
        metadata: { fileName: file.name, totalRows: 0, parsedRows: 0, columnMapping: { questionText: '' } },
      };
    case 'xlsx':
    case 'xls':
    case 'csv':
      return parseSpreadsheetFile(file);
    default:
      return {
        success: false, questions: [],
        errors: [`Unsupported file format: .${ext}. Please upload an Excel (.xlsx), CSV, PDF, or Word (.docx) file.`],
        metadata: { fileName: file.name, totalRows: 0, parsedRows: 0, columnMapping: { questionText: '' } },
      };
  }
}

export function parseQuestionsFromText(text: string): ParsedQuestion[] {
  return text.split('\n').filter(line => line.trim().length > 0).map((line, index) => ({
    id: uuid(), rowIndex: index + 1, text: line.trim(), rawRow: { text: line }
  }));
}
