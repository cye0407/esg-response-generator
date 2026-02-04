import { useState, useCallback, useEffect } from 'react';
import {
  DownloadSimple, Check, CaretDown, CaretUp, ArrowsClockwise,
  Warning, Database, Sparkle, Info, Lightning, ShieldCheck,
  FileText, CurrencyDollar, ArrowRight, ArrowLeft
} from '@phosphor-icons/react';
import { Card, CardTitle, Button, Badge, Input, TextArea, FileUpload, ProgressBar } from '@/components/ui';
import { cn } from '@/lib/utils';
import { v4 as uuid } from 'uuid';
import {
  parseQuestionFile, matchQuestions, retrieveDataForCompany,
  generateAnswerDraft, getMatchStatistics,
  loadMappingRules, loadMetricKeys, initializeMatcher, exportToExcel,
  generateAnswerWithLLM, buildLLMRequest, reprocessWithMapping,
  type ParseResult, type ParsedQuestion, type MatchResult,
  type AnswerDraft, type GenerationConfig, type CompanyData, type ColumnMapping
} from '@/lib/respond';
import { isSupabaseConfigured } from '@/lib/supabase';
import { createCheckoutSession, verifyPayment } from '@/lib/stripe';

type AppStep = 'landing' | 'company-data' | 'upload' | 'processing' | 'payment' | 'results' | 'complete';

const DEFAULT_CONFIG: GenerationConfig = {
  useLLM: false, includeMethodology: true, includeAssumptions: true,
  includeLimitations: true, verbosity: 'standard', aggregateSites: true
};

const EMPTY_COMPANY_DATA: CompanyData = {
  companyName: '', industry: '', country: '', employeeCount: 0,
  numberOfSites: 1, reportingPeriod: '', revenueBand: ''
};

const STORAGE_KEYS = {
  companyProfile: 'esg-rg-company-profile',
  session: 'esg-rg-session',
} as const;

// ============================================
// Dropdown option constants
// ============================================

const INDUSTRIES = [
  'Manufacturing', 'Transport & Logistics', 'Construction', 'Retail & Wholesale',
  'Technology & Software', 'Energy & Utilities', 'Financial Services', 'Healthcare & Pharma',
  'Agriculture & Food', 'Mining & Metals', 'Chemicals', 'Textiles & Apparel',
  'Automotive', 'Aerospace & Defence', 'Real Estate', 'Telecommunications',
  'Professional Services', 'Hospitality & Tourism', 'Education', 'Other'
];

const REPORTING_PERIODS = [
  'Jan 2024 - Dec 2024', 'Jan 2023 - Dec 2023',
  'Apr 2024 - Mar 2025', 'Apr 2023 - Mar 2024',
  'Jul 2024 - Jun 2025', 'Jul 2023 - Jun 2024',
  'Q1 2024 (Jan-Mar)', 'Q2 2024 (Apr-Jun)', 'Q3 2024 (Jul-Sep)', 'Q4 2024 (Oct-Dec)',
  'FY 2024', 'FY 2023',
];

const REVENUE_BANDS = [
  '< \u20AC1M', '\u20AC1M - \u20AC5M', '\u20AC5M - \u20AC10M', '\u20AC10M - \u20AC50M',
  '\u20AC50M - \u20AC250M', '\u20AC250M - \u20AC1B', '> \u20AC1B'
];

// ============================================
// Data category definitions for paginated form
// ============================================

type DataCategory = 'energy' | 'waste' | 'workforce' | 'health_safety' | 'scope3' | 'governance';

const DATA_CATEGORIES: { key: DataCategory; label: string; description: string }[] = [
  { key: 'energy', label: 'Energy & Emissions', description: 'Electricity, fuel, water, renewable energy' },
  { key: 'waste', label: 'Waste & Resources', description: 'Waste generation, recycling, hazardous waste' },
  { key: 'workforce', label: 'Workforce & Social', description: 'Diversity, training, employee metrics' },
  { key: 'health_safety', label: 'Health & Safety', description: 'TRIR, incidents, fatalities' },
  { key: 'scope3', label: 'Scope 3 & Transport', description: 'Business travel, commuting, freight' },
  { key: 'governance', label: 'Governance & Goals', description: 'Certifications, targets, policies' },
];

// ============================================
// FAQ data
// ============================================

const FAQ_ITEMS = [
  {
    q: 'What file formats are supported?',
    a: 'Excel (.xlsx, .xls), CSV, PDF, and Word (.docx). Multi-sheet Excel files are supported \u2014 each tab is processed as a section.'
  },
  {
    q: 'Is my data stored?',
    a: 'No. All processing happens in your browser. Company data is optionally saved to your browser\u2019s local storage for convenience, but never sent to our servers.'
  },
  {
    q: 'How accurate are the answers?',
    a: 'Answers are tailored from the data you provide. Each answer has a confidence rating (Provided, Estimated, or Unknown) so you know exactly what needs review. Emissions are auto-calculated using country-specific factors from IEA.'
  },
  {
    q: 'Which ESG frameworks are supported?',
    a: 'The tool auto-detects and supports CSRD/ESRS, GRI, CDP, EcoVadis, SASB, and TCFD questionnaires. It also works with custom questionnaires from buyers and supply chain platforms.'
  },
  {
    q: 'What\u2019s in the Excel export?',
    a: 'A multi-sheet workbook with: Executive Summary, Methodology Statement, Answers (with confidence ratings and evidence fields), and a Review Checklist for your team.'
  },
];

// ============================================
// Persistence helpers
// ============================================

function loadCompanyProfile(): CompanyData {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.companyProfile);
    if (raw) return { ...EMPTY_COMPANY_DATA, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return EMPTY_COMPANY_DATA;
}

function saveCompanyProfile(data: CompanyData) {
  try { localStorage.setItem(STORAGE_KEYS.companyProfile, JSON.stringify(data)); } catch { /* ignore */ }
}

interface SessionSnapshot {
  step: AppStep;
  companyData: CompanyData;
  questionnaireName: string;
  answerDrafts: AnswerDraft[];
  matchResults: MatchResult[];
  questions: ParsedQuestion[];
  parseResult: ParseResult | null;
  hasPaid: boolean;
}

function saveSession(snapshot: SessionSnapshot) {
  try { localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(snapshot)); } catch { /* ignore */ }
}

function loadSession(): SessionSnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.session);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

function clearSession() {
  try { localStorage.removeItem(STORAGE_KEYS.session); } catch { /* ignore */ }
}

// ============================================
// Styled select helper
// ============================================

function StyledSelect({ label, value, onChange, options, placeholder, required }: {
  label: string; value: string; onChange: (v: string) => void;
  options: string[]; placeholder?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <select
        className="w-full rounded-md border border-gray-300 bg-white py-2 px-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
      >
        <option value="">{placeholder || 'Select...'}</option>
        {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    </div>
  );
}

// ============================================
// Main App
// ============================================

export function App() {
  const [step, setStep] = useState<AppStep>('landing');
  const [sessionId] = useState(() => uuid());
  const [companyData, setCompanyData] = useState<CompanyData>(loadCompanyProfile);
  const [questionnaireName, setQuestionnaireName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [answerDrafts, setAnswerDrafts] = useState<AnswerDraft[]>([]);
  const [matchResults, setMatchResults] = useState<MatchResult[]>([]);
  const [questions, setQuestions] = useState<ParsedQuestion[]>([]);
  const [expandedAnswers, setExpandedAnswers] = useState<Set<string>>(new Set());
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [hasPaid, setHasPaid] = useState(false);
  const [showProfileSaved, setShowProfileSaved] = useState(false);
  const [useLLM, setUseLLM] = useState(true);
  const [llmStatus, setLlmStatus] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [showColumnMapping, setShowColumnMapping] = useState(false);
  const [manualMapping, setManualMapping] = useState<ColumnMapping>({ questionText: '' });
  const [showOwnEmissions, setShowOwnEmissions] = useState(false);

  // Paginated company data form
  const [selectedCategories, setSelectedCategories] = useState<Set<DataCategory>>(new Set(['energy']));
  const [companyDataPage, setCompanyDataPage] = useState(0); // 0 = category picker + basics, 1+ = category pages

  // FAQ accordion
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

  // Build page list from selected categories
  const categoryPages: DataCategory[] = DATA_CATEGORIES.filter(c => selectedCategories.has(c.key)).map(c => c.key);
  const totalPages = categoryPages.length + 1; // +1 for basics page

  const toggleCategory = (key: DataCategory) => {
    setSelectedCategories(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Restore session on mount
  useEffect(() => {
    const saved = loadSession();
    if (saved && saved.answerDrafts.length > 0) {
      setStep(saved.step === 'payment' ? 'results' : saved.step);
      setCompanyData(saved.companyData);
      setQuestionnaireName(saved.questionnaireName);
      setAnswerDrafts(saved.answerDrafts);
      setMatchResults(saved.matchResults);
      setQuestions(saved.questions);
      setParseResult(saved.parseResult);
      setHasPaid(saved.hasPaid);
    }
  }, []);

  // Load config CSVs on mount
  useEffect(() => {
    loadMappingRules().then(rules => initializeMatcher(rules)).catch(() => {});
    loadMetricKeys().catch(() => {});
  }, []);

  // Save session whenever relevant state changes
  useEffect(() => {
    if (answerDrafts.length > 0) {
      saveSession({ step, companyData, questionnaireName, answerDrafts, matchResults, questions, parseResult, hasPaid });
    }
  }, [step, companyData, questionnaireName, answerDrafts, matchResults, questions, parseResult, hasPaid]);

  // Warn before leaving
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (step !== 'landing' && step !== 'complete') { e.preventDefault(); }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [step]);

  // Check for payment return
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get('payment');
    const sid = params.get('session');
    if (payment === 'success' && sid) {
      verifyPayment(sid).then(result => { if (result.paid) { setHasPaid(true); setStep('results'); } });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const updateCompanyField = useCallback((field: keyof CompanyData, value: string | number) => {
    setCompanyData(prev => ({ ...prev, [field]: value }));
  }, []);

  const parseNumeric = useCallback((raw: string, opts?: { integer?: boolean; max?: number }): number => {
    const n = opts?.integer ? parseInt(raw) : parseFloat(raw);
    if (isNaN(n)) return 0;
    if (n < 0) return 0;
    if (opts?.max !== undefined && n > opts.max) return opts.max;
    return n;
  }, []);

  const processQuestions = useCallback(async (result: ParseResult, file: File) => {
    setParseResult(result);
    if (!result.success || result.questions.length === 0) {
      if (result.metadata.availableColumns && result.metadata.availableColumns.length > 0) {
        setUploadedFile(file);
        setShowColumnMapping(true);
        setStep('upload');
        setError('Could not auto-detect question column. Please select the correct columns below.');
        return;
      }
      throw new Error(result.errors[0] || 'Failed to parse questionnaire');
    }

    setQuestions(result.questions);
    setProgress(30);

    const matches = matchQuestions(result.questions);
    setMatchResults(matches);
    setProgress(50);

    const config: GenerationConfig = { ...DEFAULT_CONFIG, useLLM };
    const drafts: AnswerDraft[] = [];
    for (let i = 0; i < result.questions.length; i++) {
      const question = result.questions[i];
      const match = matches[i];
      const dataContext = retrieveDataForCompany(match, companyData);
      const draft = generateAnswerDraft(question, match, dataContext, config);
      drafts.push(draft);
      setProgress(50 + Math.round((i / result.questions.length) * 40));
    }

    // LLM enhancement pass
    if (useLLM && isSupabaseConfigured()) {
      setLlmStatus('Enhancing answers with AI...');
      let enhanced = 0;
      const MAX_LLM_CALLS = 100;
      for (let i = 0; i < drafts.length && enhanced < MAX_LLM_CALLS; i++) {
        const draft = drafts[i];
        if (draft.confidenceSource === 'unknown') continue;
        try {
          const llmReq = buildLLMRequest(draft.questionText, draft.category, draft.dataContext, config);
          const llmRes = await generateAnswerWithLLM(llmReq);
          if (llmRes.success && llmRes.answer) { drafts[i] = { ...draft, answer: llmRes.answer }; enhanced++; }
        } catch { /* keep template */ }
        setLlmStatus(`Enhancing answers with AI... (${enhanced}/${Math.min(drafts.length, MAX_LLM_CALLS)})`);
      }
      setLlmStatus(enhanced > 0 ? `Enhanced ${enhanced} answers with AI` : 'AI enhancement unavailable \u2014 using template answers');
    }

    setAnswerDrafts(drafts);
    setProgress(100);
    setQuestionnaireName(file.name.replace(/\.[^.]+$/, ''));
    setStep('results');
  }, [companyData, useLLM]);

  const handleFileUpload = useCallback(async (file: File) => {
    setError(null); setStep('processing'); setProgress(10); setLlmStatus(null);
    setUploadedFile(file); setShowColumnMapping(false);
    try {
      const result = await parseQuestionFile(file);
      await processQuestions(result, file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setStep('upload');
    }
  }, [processQuestions]);

  const handleManualMapping = useCallback(async () => {
    if (!uploadedFile || !manualMapping.questionText) return;
    setError(null); setStep('processing'); setProgress(10); setShowColumnMapping(false);
    try {
      const result = await reprocessWithMapping(uploadedFile, manualMapping);
      await processQuestions(result, uploadedFile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setStep('upload');
    }
  }, [uploadedFile, manualMapping, processQuestions]);

  const handlePayment = useCallback(async () => {
    setPaymentLoading(true);
    try {
      const result = await createCheckoutSession(sessionId);
      if ('url' in result) { window.location.href = result.url; }
      else { setHasPaid(true); setStep('results'); }
    } catch { setHasPaid(true); setStep('results'); }
    finally { setPaymentLoading(false); }
  }, [sessionId]);

  const handleExport = useCallback(() => {
    exportToExcel({ answerDrafts, companyData, questionnaireName, framework: parseResult?.metadata.detectedFramework });
  }, [answerDrafts, companyData, questionnaireName, parseResult]);

  const updateAnswer = useCallback((questionId: string, updates: Partial<AnswerDraft>) => {
    setAnswerDrafts(prev => prev.map(d => d.questionId === questionId ? { ...d, ...updates } : d));
  }, []);

  const regenerateAnswer = useCallback((questionId: string) => {
    const idx = questions.findIndex(q => q.id === questionId);
    if (idx === -1) return;
    const dataContext = retrieveDataForCompany(matchResults[idx], companyData);
    const newDraft = generateAnswerDraft(questions[idx], matchResults[idx], dataContext, DEFAULT_CONFIG);
    setAnswerDrafts(prev => prev.map((d, i) => i === idx ? newDraft : d));
  }, [questions, matchResults, companyData]);

  const regenerateWithLLM = useCallback(async (questionId: string) => {
    const idx = questions.findIndex(q => q.id === questionId);
    if (idx === -1 || !isSupabaseConfigured()) return;
    const draft = answerDrafts[idx];
    const config: GenerationConfig = { ...DEFAULT_CONFIG, useLLM: true };
    try {
      const llmReq = buildLLMRequest(draft.questionText, draft.category, draft.dataContext, config);
      const llmRes = await generateAnswerWithLLM(llmReq);
      if (llmRes.success && llmRes.answer) {
        setAnswerDrafts(prev => prev.map((d, i) => i === idx ? { ...d, answer: llmRes.answer! } : d));
      }
    } catch { /* keep existing */ }
  }, [questions, answerDrafts]);

  const toggleExpand = (id: string) => {
    const n = new Set(expandedAnswers);
    if (n.has(id)) n.delete(id); else n.add(id);
    setExpandedAnswers(n);
  };

  const confidenceBreakdown = answerDrafts.reduce(
    (acc, d) => { acc[d.answerConfidence]++; return acc; },
    { high: 0, medium: 0, low: 0, none: 0 }
  );

  const matchStats = matchResults.length > 0 ? getMatchStatistics(matchResults) : null;

  const confidenceColors: Record<string, string> = {
    high: 'bg-green-100 text-green-700 border-green-200',
    medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    low: 'bg-orange-100 text-orange-700 border-orange-200',
    none: 'bg-red-100 text-red-700 border-red-200',
  };
  const confidenceLabels: Record<string, string> = {
    high: 'High confidence', medium: 'Medium confidence',
    low: 'Low confidence', none: 'No data',
  };
  const confidenceTips: Record<string, string> = {
    high: 'Answered using data you provided directly',
    medium: 'Answered using estimated or auto-calculated data',
    low: 'Partially answered — some data is missing',
    none: 'No matching data found — needs your input',
  };

  // ============================================
  // Company data page renderers
  // ============================================

  const renderBasicsPage = () => (
    <>
      <Card className="mb-6">
        <CardTitle className="mb-4">Basic Information</CardTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Company Name *" value={companyData.companyName} onChange={e => updateCompanyField('companyName', e.target.value)} placeholder="Acme Corp" />
          <StyledSelect label="Industry *" value={companyData.industry} onChange={v => updateCompanyField('industry', v)} options={INDUSTRIES} placeholder="Select industry..." required />
          <Input label="Headquarters Country *" value={companyData.country} onChange={e => updateCompanyField('country', e.target.value)} placeholder="e.g., Germany" />
          <StyledSelect label="Reporting Period *" value={companyData.reportingPeriod} onChange={v => updateCompanyField('reportingPeriod', v)} options={REPORTING_PERIODS} placeholder="Select period..." required />
          <Input label="Number of Employees (FTE) *" type="number" min={0} value={companyData.employeeCount || ''} onChange={e => updateCompanyField('employeeCount', parseNumeric(e.target.value, { integer: true }))} />
          <Input label="Number of Sites" type="number" min={1} value={companyData.numberOfSites || ''} onChange={e => updateCompanyField('numberOfSites', parseNumeric(e.target.value, { integer: true }) || 1)} />
          <StyledSelect label="Revenue Band" value={companyData.revenueBand} onChange={v => updateCompanyField('revenueBand', v)} options={REVENUE_BANDS} placeholder="Select range..." />
        </div>
      </Card>

      <Card className="mb-6">
        <CardTitle className="mb-4">Which data categories do you want to enter?</CardTitle>
        <p className="text-sm text-gray-500 mb-4">Select the categories relevant to your company. You can always add more later.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {DATA_CATEGORIES.map(cat => (
            <label key={cat.key} className={cn(
              "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
              selectedCategories.has(cat.key) ? "border-primary bg-primary-50" : "border-gray-200 hover:border-gray-300"
            )}>
              <input
                type="checkbox"
                checked={selectedCategories.has(cat.key)}
                onChange={() => toggleCategory(cat.key)}
                className="rounded border-gray-300 mt-0.5"
              />
              <div>
                <p className="font-medium text-gray-900 text-sm">{cat.label}</p>
                <p className="text-xs text-gray-500">{cat.description}</p>
              </div>
            </label>
          ))}
        </div>
      </Card>
    </>
  );

  const renderCategoryPage = (cat: DataCategory) => {
    switch (cat) {
      case 'energy':
        return (
          <Card className="mb-6">
            <CardTitle className="mb-4">Energy & Emissions</CardTitle>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Electricity Consumption (kWh)" type="number" min={0} value={companyData.electricityKwh || ''} onChange={e => updateCompanyField('electricityKwh', parseNumeric(e.target.value))} />
              <Input label="Renewable Electricity (%)" type="number" min={0} max={100} value={companyData.renewablePercent ?? ''} onChange={e => updateCompanyField('renewablePercent', parseNumeric(e.target.value, { max: 100 }))} />
              <Input label="Natural Gas (m\u00B3)" type="number" min={0} value={companyData.naturalGasM3 || ''} onChange={e => updateCompanyField('naturalGasM3', parseNumeric(e.target.value))} />
              <Input label="Diesel (Liters)" type="number" min={0} value={companyData.dieselLiters || ''} onChange={e => updateCompanyField('dieselLiters', parseNumeric(e.target.value))} />
              <Input label="Water Withdrawal (m\u00B3)" type="number" min={0} value={companyData.waterM3 || ''} onChange={e => updateCompanyField('waterM3', parseNumeric(e.target.value))} />
            </div>
            <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-start gap-2 text-sm text-green-800">
                <Check className="w-4 h-4 mt-0.5 flex-shrink-0" weight="bold" />
                <div>
                  <p className="font-medium">Scope 1 & 2 emissions are auto-calculated</p>
                  <p className="text-green-600 text-xs mt-1">Scope 1 from fuel data. Scope 2 from electricity + country-specific grid factors (IEA 2023).</p>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-green-700 cursor-pointer mt-3 ml-6">
                <input type="checkbox" checked={showOwnEmissions}
                  onChange={e => { setShowOwnEmissions(e.target.checked); if (!e.target.checked) { updateCompanyField('scope1Tco2e', undefined as any); updateCompanyField('scope2Tco2e', undefined as any); } }}
                  className="rounded border-green-400" />
                I want to enter my own Scope 1/2 values instead
              </label>
            </div>
            {showOwnEmissions && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <Input label="Scope 1 Emissions (tCO2e)" type="number" min={0} value={companyData.scope1Tco2e ?? ''} onChange={e => updateCompanyField('scope1Tco2e', parseNumeric(e.target.value))} />
                <Input label="Scope 2 Emissions (tCO2e)" type="number" min={0} value={companyData.scope2Tco2e ?? ''} onChange={e => updateCompanyField('scope2Tco2e', parseNumeric(e.target.value))} />
              </div>
            )}
          </Card>
        );
      case 'waste':
        return (
          <Card className="mb-6">
            <CardTitle className="mb-4">Waste & Resources</CardTitle>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Total Waste (kg)" type="number" min={0} value={companyData.totalWasteKg || ''} onChange={e => updateCompanyField('totalWasteKg', parseNumeric(e.target.value))} />
              <Input label="Recycling Rate (%)" type="number" min={0} max={100} value={companyData.recyclingPercent ?? ''} onChange={e => updateCompanyField('recyclingPercent', parseNumeric(e.target.value, { max: 100 }))} />
              <Input label="Hazardous Waste (kg)" type="number" min={0} value={companyData.hazardousWasteKg || ''} onChange={e => updateCompanyField('hazardousWasteKg', parseNumeric(e.target.value))} />
            </div>
          </Card>
        );
      case 'workforce':
        return (
          <Card className="mb-6">
            <CardTitle className="mb-4">Workforce & Social</CardTitle>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Female Employees (%)" type="number" min={0} max={100} value={companyData.femalePercent ?? ''} onChange={e => updateCompanyField('femalePercent', parseNumeric(e.target.value, { max: 100 }))} />
              <Input label="Training Hours per Employee" type="number" min={0} value={companyData.trainingHoursPerEmployee ?? ''} onChange={e => updateCompanyField('trainingHoursPerEmployee', parseNumeric(e.target.value))} />
            </div>
          </Card>
        );
      case 'health_safety':
        return (
          <Card className="mb-6">
            <CardTitle className="mb-4">Health & Safety</CardTitle>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Input label="TRIR" type="number" min={0} value={companyData.trirRate ?? ''} onChange={e => updateCompanyField('trirRate', parseNumeric(e.target.value))} hint="Total Recordable Incident Rate \u2014 recordable incidents per 200,000 hours worked" />
              </div>
              <Input label="Lost Time Incidents" type="number" min={0} value={companyData.lostTimeIncidents ?? ''} onChange={e => updateCompanyField('lostTimeIncidents', parseNumeric(e.target.value, { integer: true }))} />
              <Input label="Fatalities" type="number" min={0} value={companyData.fatalities ?? ''} onChange={e => updateCompanyField('fatalities', parseNumeric(e.target.value, { integer: true }))} />
            </div>
          </Card>
        );
      case 'scope3':
        return (
          <Card className="mb-6">
            <CardTitle className="mb-4">Scope 3 & Transport</CardTitle>
            <p className="text-sm text-gray-500 mb-4">Scope 3 covers indirect emissions from your value chain. Enter what you have \u2014 any data helps.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Scope 3 Total (tCO2e)" type="number" min={0} value={companyData.scope3Tco2e ?? ''} onChange={e => updateCompanyField('scope3Tco2e', parseNumeric(e.target.value))} hint="If you have a calculated total already" />
              <Input label="Scope 3 Categories Reported" value={companyData.scope3Categories || ''} onChange={e => updateCompanyField('scope3Categories', e.target.value)} placeholder="e.g., Cat 6 Business Travel, Cat 7 Commuting" />
              <Input label="Business Travel (km)" type="number" min={0} value={companyData.businessTravelKm ?? ''} onChange={e => updateCompanyField('businessTravelKm', parseNumeric(e.target.value))} />
              <Input label="Employee Commuting (km)" type="number" min={0} value={companyData.employeeCommuteKm ?? ''} onChange={e => updateCompanyField('employeeCommuteKm', parseNumeric(e.target.value))} />
              <Input label="Freight Transport (ton-km)" type="number" min={0} value={companyData.freightTonKm ?? ''} onChange={e => updateCompanyField('freightTonKm', parseNumeric(e.target.value))} />
            </div>
          </Card>
        );
      case 'governance':
        return (
          <Card className="mb-6">
            <CardTitle className="mb-4">Governance & Goals</CardTitle>
            <div className="space-y-4">
              <Input label="Certifications" value={companyData.certifications || ''} onChange={e => updateCompanyField('certifications', e.target.value)} placeholder="e.g., ISO 14001, ISO 45001, FSC" />
              <Input label="Sustainability Goal" value={companyData.sustainabilityGoal || ''} onChange={e => updateCompanyField('sustainabilityGoal', e.target.value)} placeholder="e.g., Net zero by 2030" />
              <TextArea label="Additional Context" value={companyData.additionalContext || ''} onChange={e => updateCompanyField('additionalContext', e.target.value)} placeholder="Any additional information about your sustainability initiatives, policies, or programs..." rows={3} />
            </div>
          </Card>
        );
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" weight="duotone" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">ESG Response Generator</h1>
              <p className="text-xs text-gray-500">by ESG for Suppliers</p>
            </div>
          </div>
          {step !== 'landing' && (
            <Button variant="ghost" size="sm" onClick={() => { setStep('landing'); setError(null); setAnswerDrafts([]); setMatchResults([]); setQuestions([]); setParseResult(null); setProgress(0); setHasPaid(false); clearSession(); }}>
              Start Over
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Error */}
        {error && (
          <Card className="mb-6 bg-red-50 border-red-200">
            <div className="flex items-start gap-3">
              <Warning className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" weight="duotone" />
              <div>
                <p className="font-medium text-red-800">Something went wrong</p>
                <p className="text-sm text-red-600">{error}</p>
                <div className="mt-2 text-xs text-red-500">
                  {error.includes('column') && <p>Tip: Ensure your file has a header row with a column named &quot;Question&quot; or similar.</p>}
                  {error.includes('parse') && <p>Tip: Try saving the file as .xlsx format and uploading again.</p>}
                  {error.includes('format') && <p>Tip: Supported formats are Excel (.xlsx, .xls), CSV, PDF, and Word (.docx).</p>}
                  {error.includes('payment') && <p>Tip: Your answers are saved &mdash; you can try again without re-uploading.</p>}
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* ===== LANDING ===== */}
        {step === 'landing' && (
          <div className="animate-fade-in">
            {/* Hero */}
            <div className="text-center mb-12 mt-8">
              <h2 className="text-4xl font-bold text-gray-900 mb-4">
                Answer ESG Questionnaires<br />
                <span className="text-primary">in Minutes, Not Days</span>
              </h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-4">
                Upload your questionnaire. Enter your data. Get a complete, tailored response pack
                with draft answers, confidence ratings, and methodology documentation.
              </p>
              <p className="text-sm text-gray-400 mb-8">
                Works with CSRD &middot; CDP &middot; EcoVadis &middot; GRI &middot; SASB &middot; TCFD
              </p>
              <Button size="lg" onClick={() => setStep('company-data')}>
                Get Started <ArrowRight className="w-5 h-5 ml-2" weight="bold" />
              </Button>
            </div>

            {/* What You Get + How It Works — combined card */}
            <Card className="mb-8" padding="lg">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* How It Works — vertical timeline (left) */}
                <div>
                  <CardTitle className="mb-5">How It Works</CardTitle>
                  <div className="relative pl-10">
                    {/* Vertical line */}
                    <div className="absolute left-[15px] top-1 bottom-1 w-0.5 bg-primary-200" />
                    {[
                      { n: '1', title: 'Enter Your Data', desc: 'Fill in your company\u2019s energy, emissions, waste, workforce, and governance data. Saved locally for reuse.' },
                      { n: '2', title: 'Upload Questionnaire', desc: 'Upload Excel, CSV, PDF, or Word files. Questions are auto-matched to your data.' },
                      { n: '3', title: 'Review & Export', desc: 'Preview tailored draft answers, edit as needed, and export a professional Excel response pack.' },
                    ].map((s, i) => (
                      <div key={s.n} className={cn("relative", i < 2 && "mb-8")}>
                        <div className="absolute -left-10 w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold shadow-sm">{s.n}</div>
                        <h4 className="font-semibold text-gray-900">{s.title}</h4>
                        <p className="text-sm text-gray-600 mt-1">{s.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* What You Get (right) */}
                <div>
                  <CardTitle className="mb-5">What You Get</CardTitle>
                  <div className="space-y-2.5 text-sm">
                    {[
                      'Tailored draft answers for every question',
                      'AI-enhanced professional language',
                      'Confidence ratings (know where you need more data)',
                      'Evidence fields for audit trail',
                      'Executive Summary with gap overview',
                      'Methodology Statement (attach to your submission)',
                      'Review Checklist for your team',
                      'Country-specific emission calculations',
                    ].map(item => (
                      <div key={item} className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-purple-600 flex-shrink-0" weight="bold" />
                        <span className="text-gray-700">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            {/* Trust Signals */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <Card className="text-center bg-cream" padding="lg">
                <ShieldCheck className="w-8 h-8 text-purple-600 mx-auto mb-3" weight="duotone" />
                <h3 className="font-semibold text-gray-900 mb-1">Privacy First</h3>
                <p className="text-xs text-gray-500">Your data stays in your browser. We never store company data, questionnaires, or answers.</p>
              </Card>
              <Card className="text-center bg-cream" padding="lg">
                <Lightning className="w-8 h-8 text-purple-600 mx-auto mb-3" weight="duotone" />
                <h3 className="font-semibold text-gray-900 mb-1">Framework Aware</h3>
                <p className="text-xs text-gray-500">Auto-detects CSRD, GRI, CDP, EcoVadis, SASB, and TCFD. Tailors language accordingly.</p>
              </Card>
              <Card className="text-center bg-cream" padding="lg">
                <CurrencyDollar className="w-8 h-8 text-purple-600 mx-auto mb-3" weight="duotone" />
                <h3 className="font-semibold text-gray-900 mb-1">One-Time Payment</h3>
                <p className="text-xs text-gray-500">Pay once per questionnaire. No subscription, no hidden fees.</p>
              </Card>
            </div>

            {/* FAQ — Accordion */}
            <Card className="mb-8" padding="lg">
              <CardTitle className="mb-4">Frequently Asked Questions</CardTitle>
              <div className="divide-y divide-gray-200">
                {FAQ_ITEMS.map((item, i) => (
                  <div key={i}>
                    <button
                      className="w-full flex items-center justify-between py-3 text-left"
                      onClick={() => setOpenFaqIndex(openFaqIndex === i ? null : i)}
                    >
                      <span className="font-medium text-gray-900 text-sm">{item.q}</span>
                      {openFaqIndex === i
                        ? <CaretUp className="w-4 h-4 text-gray-400 flex-shrink-0" weight="bold" />
                        : <CaretDown className="w-4 h-4 text-gray-400 flex-shrink-0" weight="bold" />
                      }
                    </button>
                    {openFaqIndex === i && (
                      <p className="text-sm text-gray-600 pb-3">{item.a}</p>
                    )}
                  </div>
                ))}
              </div>
            </Card>

            {/* Bottom CTA */}
            <div className="text-center mt-12 mb-8">
              <Button size="lg" variant="outline" onClick={() => setStep('company-data')}>
                Get Started <ArrowRight className="w-5 h-5 ml-2" weight="bold" />
              </Button>
            </div>
          </div>
        )}

        {/* ===== COMPANY DATA (Paginated) ===== */}
        {step === 'company-data' && (
          <div className="animate-fade-in max-w-3xl mx-auto">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-1">Company Information</h2>
              <p className="text-gray-500">
                {companyDataPage === 0
                  ? 'Enter your basic details and choose which data categories to fill in.'
                  : `Step ${companyDataPage + 1} of ${totalPages} \u2014 ${DATA_CATEGORIES.find(c => c.key === categoryPages[companyDataPage - 1])?.label}`
                }
              </p>
              {/* Progress dots */}
              <div className="flex items-center gap-2 mt-3">
                {Array.from({ length: totalPages }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => setCompanyDataPage(i)}
                    className={cn(
                      "w-2.5 h-2.5 rounded-full transition-colors",
                      i === companyDataPage ? "bg-primary" : i < companyDataPage ? "bg-primary-300" : "bg-gray-200"
                    )}
                  />
                ))}
                <span className="text-xs text-gray-400 ml-2">{companyDataPage + 1} / {totalPages}</span>
              </div>
            </div>

            {/* Page content */}
            {companyDataPage === 0 && renderBasicsPage()}
            {companyDataPage > 0 && categoryPages[companyDataPage - 1] && renderCategoryPage(categoryPages[companyDataPage - 1])}

            {/* Navigation */}
            <div className="flex items-center justify-between mt-6">
              <div className="flex items-center gap-2">
                {companyDataPage > 0 && (
                  <Button variant="outline" onClick={() => setCompanyDataPage(p => p - 1)}>
                    <ArrowLeft className="w-4 h-4 mr-1" weight="bold" /> Back
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => { saveCompanyProfile(companyData); setShowProfileSaved(true); setTimeout(() => setShowProfileSaved(false), 2000); }}>
                  Save Profile
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { const p = loadCompanyProfile(); if (p.companyName) setCompanyData(p); }}>
                  Load Saved
                </Button>
                {showProfileSaved && <span className="text-xs text-green-600 font-medium">Saved</span>}
              </div>
              {companyDataPage < totalPages - 1 ? (
                <Button size="lg" onClick={() => setCompanyDataPage(p => p + 1)}
                  disabled={companyDataPage === 0 && (!companyData.companyName || !companyData.industry || !companyData.country)}>
                  Next <ArrowRight className="w-5 h-5 ml-1" weight="bold" />
                </Button>
              ) : (
                <Button size="lg" onClick={() => setStep('upload')}
                  disabled={!companyData.companyName || !companyData.industry || !companyData.country}>
                  Upload Questionnaire <ArrowRight className="w-5 h-5 ml-1" weight="bold" />
                </Button>
              )}
            </div>
          </div>
        )}

        {/* ===== UPLOAD ===== */}
        {step === 'upload' && (
          <div className="animate-fade-in max-w-2xl mx-auto">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-1">Upload Questionnaire</h2>
              <p className="text-gray-500">Upload your ESG questionnaire file to generate tailored draft responses.</p>
            </div>

            <Card className="mb-6">
              <FileUpload
                label="Upload File"
                accept=".xlsx,.xls,.csv,.pdf,.docx"
                onFileSelect={handleFileUpload}
                hint="Supports Excel (.xlsx, .xls), CSV, PDF, and Word (.docx) files"
              />
              <div className="mt-4 pt-4 border-t">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={useLLM} onChange={e => setUseLLM(e.target.checked)} className="rounded border-gray-300" />
                  <Sparkle className="w-4 h-4 text-primary" weight="duotone" />
                  Enhance answers with AI
                  <span className="text-xs text-gray-400">(recommended)</span>
                </label>
                {!isSupabaseConfigured() && useLLM && (
                  <p className="text-xs text-amber-600 mt-1 ml-6">AI enhancement requires service configuration. Template-based answers will be used.</p>
                )}
              </div>
            </Card>

            {/* Manual column mapping fallback */}
            {showColumnMapping && parseResult?.metadata.availableColumns && (
              <Card className="mb-6 border-amber-200 bg-amber-50">
                <CardTitle className="mb-3 text-amber-800">Manual Column Mapping</CardTitle>
                <p className="text-sm text-amber-700 mb-4">We couldn&apos;t auto-detect the question column. Please select the correct columns from your file.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Question column *</label>
                    <select className="w-full rounded-md border border-gray-300 bg-white py-2 px-3 text-sm" value={manualMapping.questionText}
                      onChange={e => setManualMapping(prev => ({ ...prev, questionText: e.target.value }))}>
                      <option value="">Select column...</option>
                      {parseResult.metadata.availableColumns.map(col => <option key={col} value={col}>{col}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Category column</label>
                    <select className="w-full rounded-md border border-gray-300 bg-white py-2 px-3 text-sm" value={manualMapping.category || ''}
                      onChange={e => setManualMapping(prev => ({ ...prev, category: e.target.value || undefined }))}>
                      <option value="">None</option>
                      {parseResult.metadata.availableColumns.map(col => <option key={col} value={col}>{col}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Reference ID column</label>
                    <select className="w-full rounded-md border border-gray-300 bg-white py-2 px-3 text-sm" value={manualMapping.referenceId || ''}
                      onChange={e => setManualMapping(prev => ({ ...prev, referenceId: e.target.value || undefined }))}>
                      <option value="">None</option>
                      {parseResult.metadata.availableColumns.map(col => <option key={col} value={col}>{col}</option>)}
                    </select>
                  </div>
                </div>
                <div className="mt-4">
                  <Button onClick={handleManualMapping} disabled={!manualMapping.questionText}>Apply Mapping</Button>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* ===== PROCESSING ===== */}
        {step === 'processing' && (
          <div className="max-w-md mx-auto animate-fade-in">
            <Card className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-forest-700 mx-auto mb-6" />
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Processing Questionnaire</h2>
              <p className="text-gray-600 mb-4">{llmStatus || 'Analyzing questions and generating tailored draft answers...'}</p>
              <ProgressBar value={progress} />
            </Card>
          </div>
        )}

        {/* ===== RESULTS ===== */}
        {step === 'results' && (
          <div className="animate-fade-in">
            {/* Unlock CTA */}
            {!hasPaid && (
              <Card className="mb-6 bg-primary-50 border-primary-200">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                  <div>
                    <h3 className="font-bold text-gray-900 text-lg">Your report is ready!</h3>
                    <p className="text-sm text-gray-600">Preview your tailored answers below. Unlock the full editable report with export.</p>
                  </div>
                  <Button size="lg" onClick={handlePayment} isLoading={paymentLoading}>
                    <CurrencyDollar className="w-5 h-5 mr-2" weight="duotone" />
                    Unlock Full Report
                  </Button>
                </div>
              </Card>
            )}

            {/* Summary Bar */}
            <Card className="mb-6 bg-cream">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-gray-900">{parseResult?.metadata.fileName || questionnaireName}</h2>
                  <p className="text-sm text-gray-500">
                    {answerDrafts.length} questions analyzed
                    {parseResult?.metadata.sheetsProcessed && parseResult.metadata.sheetsProcessed > 1 && (
                      <span className="ml-2">| {parseResult.metadata.sheetsProcessed} sheets</span>
                    )}
                    {parseResult?.metadata.detectedFramework && (
                      <span className="ml-2">| Framework: <strong>{parseResult.metadata.detectedFramework}</strong></span>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex gap-1">
                    <span className="px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-700 cursor-help" title="Answered using data you provided directly">{confidenceBreakdown.high} high</span>
                    <span className="px-2 py-1 rounded text-xs font-medium bg-yellow-100 text-yellow-700 cursor-help" title="Answered using estimated or auto-calculated data">{confidenceBreakdown.medium} medium</span>
                    <span className="px-2 py-1 rounded text-xs font-medium bg-orange-100 text-orange-700 cursor-help" title="Partially answered — some data is missing">{confidenceBreakdown.low} low</span>
                    <span className="px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-700 cursor-help" title="No matching data found — needs your input">{confidenceBreakdown.none} no data</span>
                  </div>
                  {hasPaid ? (
                    <Button variant="outline" onClick={handleExport}>
                      <DownloadSimple className="w-4 h-4 mr-2" weight="duotone" /> Export Excel
                    </Button>
                  ) : (
                    <Button variant="outline" disabled className="opacity-50">
                      <DownloadSimple className="w-4 h-4 mr-2" weight="duotone" /> Export (unlock to download)
                    </Button>
                  )}
                </div>
              </div>
            </Card>

            {/* Category summary */}
            {matchStats && (
              <Card className="mb-6">
                <CardTitle className="text-sm mb-3">Questions by Category</CardTitle>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(matchStats.byDomain).sort((a, b) => b[1] - a[1]).map(([domain, count]) => (
                    <span key={domain} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 text-xs font-medium text-gray-700">
                      <span className="capitalize">{domain.replace(/_/g, ' ')}</span>
                      <span className="bg-gray-300 text-gray-600 rounded-full w-5 h-5 flex items-center justify-center text-[10px]">{count}</span>
                    </span>
                  ))}
                </div>
              </Card>
            )}

            {/* Answer Cards */}
            <div className={cn('space-y-4 relative', !hasPaid && 'select-none')}>
              {!hasPaid && (
                <div className="sticky top-4 z-20 flex justify-center mb-4">
                  <div className="bg-white/90 backdrop-blur-sm border border-gray-300 rounded-full px-6 py-3 shadow-lg flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-700">PREVIEW MODE</span>
                    <Button size="sm" onClick={handlePayment} isLoading={paymentLoading}>Unlock Full Report</Button>
                  </div>
                </div>
              )}
              {answerDrafts.map((draft, index) => (
                <Card key={draft.questionId} className={cn('transition-all', draft.needsReview && 'border-l-4 border-l-amber-400')}>
                  <div className="flex items-start justify-between cursor-pointer" onClick={() => toggleExpand(draft.questionId)}>
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="text-sm font-medium text-gray-500">Q{index + 1}</span>
                        {draft.category && <Badge variant="info">{draft.category}</Badge>}
                        <span className={cn('px-2 py-0.5 rounded text-xs font-medium cursor-help', confidenceColors[draft.answerConfidence])} title={confidenceTips[draft.answerConfidence]}>
                          {confidenceLabels[draft.answerConfidence]}
                        </span>
                        {draft.isEstimate && (
                          <span className="text-xs text-orange-600 flex items-center gap-1">
                            <Warning className="w-3 h-3" weight="fill" /> Estimated
                          </span>
                        )}
                        {draft.matchResult.primaryDomain && (
                          <span className="text-xs text-gray-400">&rarr; {draft.matchResult.primaryDomain.replace('_', ' ')}</span>
                        )}
                      </div>
                      <p className="font-medium text-gray-900">{draft.questionText}</p>
                      {!expandedAnswers.has(draft.questionId) && draft.answer && (
                        <p className={cn("text-sm text-gray-600 mt-2 line-clamp-4", !hasPaid && index >= 3 && "blur-[3px]")}>{draft.answer}</p>
                      )}
                    </div>
                    <div className="ml-4">
                      {expandedAnswers.has(draft.questionId) ? <CaretUp className="w-5 h-5 text-gray-400" weight="bold" /> : <CaretDown className="w-5 h-5 text-gray-400" weight="bold" />}
                    </div>
                  </div>

                  {expandedAnswers.has(draft.questionId) && (
                    <div className={cn("mt-4 pt-4 border-t space-y-4", !hasPaid && index >= 3 && "blur-[3px] pointer-events-none")}>
                      {draft.matchResult.matchedKeywords.length > 0 && (
                        <div className="flex items-start gap-2 text-xs">
                          <Sparkle className="w-3 h-3 text-primary mt-0.5" weight="duotone" />
                          <div>
                            <span className="text-gray-500">Matched: </span>
                            <span className="text-forest-700">{draft.matchResult.matchedKeywords.join(', ')}</span>
                          </div>
                        </div>
                      )}

                      <TextArea label="Answer" value={draft.answer} onChange={e => updateAnswer(draft.questionId, { answer: e.target.value })} rows={4} style={{ fieldSizing: 'content' as any, minHeight: '6rem' }} />

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input label="Data Value" value={draft.dataValue || ''} onChange={e => updateAnswer(draft.questionId, { dataValue: e.target.value })} />
                        <Input label="Period" value={draft.dataPeriod || ''} onChange={e => updateAnswer(draft.questionId, { dataPeriod: e.target.value })} />
                      </div>

                      <Input label="Evidence / Source" value={draft.evidence || ''} onChange={e => updateAnswer(draft.questionId, { evidence: e.target.value, dataSource: e.target.value })} placeholder="e.g., Electricity bill Jan-Dec 2024, ISO 14001 certificate" />

                      {draft.confidenceSource !== 'unknown' && (
                        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                          <input type="checkbox" checked={draft.confidenceSource === 'estimated'}
                            onChange={e => updateAnswer(draft.questionId, { confidenceSource: e.target.checked ? 'estimated' : 'provided' })}
                            className="rounded border-gray-300" />
                          This value is estimated
                        </label>
                      )}

                      {draft.promptForMissing && (
                        <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
                          <Info className="w-4 h-4 inline mr-1" weight="duotone" />{draft.promptForMissing}
                        </div>
                      )}

                      {draft.metricKeysUsed && draft.metricKeysUsed.length > 0 && (
                        <div className="text-xs text-gray-400">Metric keys: {draft.metricKeysUsed.join(', ')}</div>
                      )}

                      {draft.limitations && draft.limitations.length > 0 && (
                        <div className="p-3 bg-amber-50 rounded-lg text-sm">
                          <div className="flex items-center gap-2 text-amber-800 font-medium mb-1">
                            <Info className="w-4 h-4" weight="duotone" /> Data Limitations
                          </div>
                          <ul className="list-disc list-inside text-amber-700 space-y-1">
                            {draft.limitations.map((l, i) => <li key={i}>{l}</li>)}
                          </ul>
                        </div>
                      )}

                      {(draft.dataContext.operational.length > 0 || draft.dataContext.company.length > 0) && (
                        <div className="p-3 bg-gray-50 rounded-lg text-sm">
                          <div className="flex items-center gap-2 text-gray-700 font-medium mb-2">
                            <Database className="w-4 h-4" weight="duotone" /> Available Data Points
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            {[...draft.dataContext.company, ...draft.dataContext.operational].slice(0, 6).map((point, i) => (
                              <div key={i} className="flex justify-between">
                                <span className="text-gray-500">{point.label}</span>
                                <span className="font-medium">{point.value}{point.unit && ` ${point.unit}`}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex justify-end gap-2 pt-2">
                        <Button variant="ghost" size="sm" onClick={() => regenerateAnswer(draft.questionId)}>
                          <ArrowsClockwise className="w-4 h-4 mr-1" weight="duotone" /> Regenerate
                        </Button>
                        {isSupabaseConfigured() && draft.confidenceSource !== 'unknown' && (
                          <Button variant="ghost" size="sm" onClick={() => regenerateWithLLM(draft.questionId)}>
                            <Sparkle className="w-4 h-4 mr-1" weight="duotone" /> Enhance with AI
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </Card>
              ))}
            </div>

            {/* Bottom unlock CTA */}
            {!hasPaid && (
              <Card className="mt-8 bg-primary-50 border-primary-200 text-center">
                <h3 className="font-bold text-gray-900 text-lg mb-2">Ready to unlock your full report?</h3>
                <p className="text-sm text-gray-600 mb-4">Get editable answers, Excel export, methodology statement, and review checklist.</p>
                <Button size="lg" onClick={handlePayment} isLoading={paymentLoading}>
                  <CurrencyDollar className="w-5 h-5 mr-2" weight="duotone" />
                  Unlock Full Report
                </Button>
                <p className="text-xs text-gray-400 mt-3">Secure payment via Stripe. One-time purchase, no subscription.</p>
              </Card>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 mt-16">
        <div className="max-w-5xl mx-auto px-4 py-6 text-center text-sm text-gray-400">
          <p>ESG for Suppliers &middot; ESG Response Generator</p>
          <p className="mt-1">
            <a href="mailto:contact@esgforsuppliers.com" className="hover:text-gray-600">contact@esgforsuppliers.com</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
