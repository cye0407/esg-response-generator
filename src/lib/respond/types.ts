// ============================================
// Response Generator - Type Definitions (Standalone)
// ============================================

export type ConfidenceLevel = 'high' | 'medium' | 'low';
export type DataSource = 'bill' | 'invoice' | 'erp' | 'meter' | 'supplier' | 'estimate' | 'other';

// ============================================
// Company Data Input (replaces Zustand stores)
// ============================================

export interface CompanyData {
  companyName: string;
  industry: string;
  country: string;
  employeeCount: number;
  numberOfSites: number;
  reportingPeriod: string;
  revenueBand: string;

  // Energy
  electricityKwh?: number;
  renewablePercent?: number;
  naturalGasM3?: number;
  dieselLiters?: number;
  waterM3?: number;

  // Emissions
  scope1Tco2e?: number;
  scope2Tco2e?: number;
  scope3Tco2e?: number;
  scope3Categories?: string;
  businessTravelKm?: number;
  employeeCommuteKm?: number;
  freightTonKm?: number;

  // Waste
  totalWasteKg?: number;
  recyclingPercent?: number;
  hazardousWasteKg?: number;

  // Workforce
  femalePercent?: number;
  trainingHoursPerEmployee?: number;
  trirRate?: number;
  lostTimeIncidents?: number;
  fatalities?: number;

  // Governance
  certifications?: string;
  sustainabilityGoal?: string;

  // Additional context
  additionalContext?: string;
}

// ============================================
// Question Parsing
// ============================================

export interface ParsedQuestion {
  id: string;
  rowIndex: number;
  text: string;
  category?: string;
  subcategory?: string;
  referenceId?: string;
  framework?: string;
  required?: boolean;
  rawRow: Record<string, unknown>;
}

export interface ParseResult {
  success: boolean;
  questions: ParsedQuestion[];
  errors: string[];
  metadata: {
    fileName: string;
    totalRows: number;
    parsedRows: number;
    detectedFramework?: string;
    columnMapping: ColumnMapping;
    availableColumns?: string[];
    autoDetectionConfidence?: 'high' | 'medium' | 'low';
    sheetsProcessed?: number;
  };
}

export interface ColumnMapping {
  questionText: string;
  category?: string;
  subcategory?: string;
  referenceId?: string;
  required?: string;
}

// ============================================
// Keyword Matching
// ============================================

export type DataDomain =
  | 'company' | 'site' | 'goals' | 'swot' | 'regulatory'
  | 'materials' | 'packaging'
  | 'energy_electricity' | 'energy_fuel' | 'energy_water'
  | 'emissions' | 'infrastructure' | 'transport'
  | 'workforce' | 'health_safety' | 'training'
  | 'waste' | 'products' | 'effluents'
  | 'external_context' | 'financial_context' | 'buyer_requirements';

export type TopicTag =
  | 'ghg_emissions' | 'scope_1' | 'scope_2' | 'scope_3'
  | 'renewable_energy' | 'energy_consumption' | 'water_usage'
  | 'waste_management' | 'recycling' | 'circular_economy'
  | 'biodiversity' | 'pollution' | 'climate_targets'
  | 'employee_count' | 'diversity' | 'health_safety' | 'training'
  | 'human_rights' | 'labor_practices' | 'community' | 'supply_chain_social'
  | 'certifications' | 'policies' | 'compliance' | 'risk_management'
  | 'supplier_management' | 'ethics' | 'transparency'
  | 'materials' | 'packaging' | 'transport' | 'logistics'
  | 'production' | 'facilities'
  | 'company_profile' | 'revenue' | 'strategy' | 'targets';

export interface MatchResult {
  questionId: string;
  primaryDomain: DataDomain | null;
  secondaryDomains: DataDomain[];
  topics: TopicTag[];
  confidence: 'high' | 'medium' | 'low' | 'none';
  matchedKeywords: string[];
  suggestedDataPoints: string[];
}

export interface KeywordRule {
  keywords: string[];
  domain: DataDomain;
  topics: TopicTag[];
  weight: number;
}

// ============================================
// Data Retrieval
// ============================================

export interface RetrievedDataPoint {
  domain: DataDomain;
  field: string;
  label: string;
  value: string | number | boolean | null;
  unit?: string;
  period?: string;
  source?: DataSource;
  confidence?: ConfidenceLevel;
}

export interface DataContext {
  company: RetrievedDataPoint[];
  operational: RetrievedDataPoint[];
  calculated: RetrievedDataPoint[];
  metadata: {
    reportingPeriod?: string;
    sitesIncluded: string[];
    dataGaps: string[];
  };
}

// ============================================
// Answer Generation
// ============================================

export interface AnswerDraft {
  questionId: string;
  questionText: string;
  category?: string;
  matchResult: MatchResult;
  dataContext: DataContext;
  answer: string;
  dataValue?: string;
  dataUnit?: string;
  dataPeriod?: string;
  dataSource?: string;
  answerConfidence: 'high' | 'medium' | 'low' | 'none';
  confidenceSource: 'provided' | 'estimated' | 'unknown';
  methodology?: string;
  assumptions?: string[];
  limitations?: string[];
  suggestedEvidence?: string[];
  evidence: string;
  metricKeysUsed: string[];
  promptForMissing?: string;
  needsReview: boolean;
  isEstimate: boolean;
  hasDataGaps: boolean;
}

// ============================================
// Metric Keys (loaded from CSV)
// ============================================

export interface MetricKey {
  key: string;
  label: string;
  unit: string;
  period: string;
  allowedInputType: 'number' | 'boolean';
  definition: string;
  notes: string;
}

// ============================================
// Mapping Rules (loaded from CSV)
// ============================================

export interface MappingRule {
  priority: number;
  patternType: 'regex' | 'keyword';
  pattern: string;
  category: string;
  metricKeys: string[];
  answerTemplate: string;
  promptIfMissing: string;
}

export interface GenerationConfig {
  useLLM: boolean;
  includeMethodology: boolean;
  includeAssumptions: boolean;
  includeLimitations: boolean;
  verbosity: 'concise' | 'standard' | 'detailed';
  aggregateSites: boolean;
}

export interface ResponseSession {
  id: string;
  questionnaireName: string;
  requestor?: string;
  framework?: string;
  parseResult: ParseResult;
  matchResults: MatchResult[];
  answerDrafts: AnswerDraft[];
  status: 'parsing' | 'matching' | 'generating' | 'review' | 'complete';
  progress: number;
  createdAt: string;
  updatedAt: string;
}
