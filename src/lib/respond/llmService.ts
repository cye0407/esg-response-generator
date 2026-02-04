import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { DataContext, GenerationConfig } from './types';

export interface GenerateAnswerRequest {
  question: string;
  category?: string;
  dataPoints: Array<{ label: string; value: string | number; unit?: string }>;
  reportingPeriod?: string;
  sites?: string[];
  verbosity?: 'concise' | 'standard' | 'detailed';
  includeMethodology?: boolean;
  includeAssumptions?: boolean;
  includeLimitations?: boolean;
}

export interface GenerateAnswerResponse {
  success: boolean;
  answer?: string;
  error?: string;
  usage?: { inputTokens: number; outputTokens: number };
}

async function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try { return await fn(); } catch (err) {
      lastError = err;
      if (attempt < maxRetries) await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
      else throw err;
    }
  }
  throw lastError;
}

export async function generateAnswerWithLLM(request: GenerateAnswerRequest): Promise<GenerateAnswerResponse> {
  if (!isSupabaseConfigured()) return { success: false, error: 'Supabase is not configured.' };
  try {
    const { data, error } = await retryWithBackoff(() => supabase.functions.invoke('generate-answer', { body: request }));
    if (error) return { success: false, error: error.message || 'Failed to call generate-answer function' };
    return data as GenerateAnswerResponse;
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export function buildLLMRequest(questionText: string, category: string | undefined, dataContext: DataContext, config: GenerationConfig): GenerateAnswerRequest {
  const allPoints = [...dataContext.company, ...dataContext.operational, ...dataContext.calculated];
  return {
    question: questionText, category,
    dataPoints: allPoints.filter(p => p.value !== null && p.value !== undefined).map(p => ({ label: p.label, value: p.value as string | number, unit: p.unit })),
    reportingPeriod: dataContext.metadata.reportingPeriod,
    sites: dataContext.metadata.sitesIncluded,
    verbosity: config.verbosity,
    includeMethodology: config.includeMethodology,
    includeAssumptions: config.includeAssumptions,
    includeLimitations: config.includeLimitations
  };
}
