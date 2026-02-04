export * from './types';
export { parseQuestionFile, parseQuestionsFromText, reprocessWithMapping } from './questionParser';
export { matchQuestion, matchQuestions, getMatchStatistics, initializeMatcher } from './keywordMatcher';
export { retrieveDataForCompany } from './dataRetrieval';
export { generateAnswerDraft, generateAnswerDrafts, buildLLMPrompt } from './answerGenerator';
export { generateAnswerWithLLM, buildLLMRequest, type GenerateAnswerRequest, type GenerateAnswerResponse } from './llmService';
export { loadMappingRules, loadMetricKeys, FIELD_TO_METRIC_KEY } from './configLoader';
export { exportToExcel } from './excelExporter';
export { getElectricityFactor, estimateScope1, estimateScope2Location, SUPPORTED_COUNTRIES } from './emissionFactors';
