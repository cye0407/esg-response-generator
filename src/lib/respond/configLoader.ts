import type { MappingRule, MetricKey } from './types';

// ============================================
// Config Loader — loads CSV specs at runtime
// ============================================

let cachedMappingRules: MappingRule[] | null = null;
let cachedMetricKeys: MetricKey[] | null = null;

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split('\n').map(l => l.replace(/\r$/, '')).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] || ''; });
    return row;
  });
}

export async function loadMappingRules(): Promise<MappingRule[]> {
  if (cachedMappingRules) return cachedMappingRules;

  try {
    const resp = await fetch('/specs/question-mapping-v1.csv');
    if (!resp.ok) throw new Error(`Failed to load mapping rules: ${resp.status}`);
    const text = await resp.text();
    const rows = parseCSV(text);

    cachedMappingRules = rows.map(row => ({
      priority: parseInt(row.priority) || 99,
      patternType: (row.patternType as 'regex' | 'keyword') || 'keyword',
      pattern: row.pattern || '',
      category: row.category || '',
      metricKeys: row.metricKeys ? row.metricKeys.split(',').map(k => k.trim()) : [],
      answerTemplate: row.answerTemplate || '',
      promptIfMissing: row.promptIfMissing || '',
    }));

    return cachedMappingRules;
  } catch (err) {
    console.warn('Failed to load mapping rules from CSV, using empty set:', err);
    return [];
  }
}

export async function loadMetricKeys(): Promise<MetricKey[]> {
  if (cachedMetricKeys) return cachedMetricKeys;

  try {
    const resp = await fetch('/specs/metric-keys-v1.csv');
    if (!resp.ok) throw new Error(`Failed to load metric keys: ${resp.status}`);
    const text = await resp.text();
    const rows = parseCSV(text);

    cachedMetricKeys = rows.map(row => ({
      key: row.metricKey || '',
      label: row.label || '',
      unit: row.unit || '',
      period: row.period || '',
      allowedInputType: row.allowedInputType === 'boolean' ? 'boolean' : 'number',
      definition: row.definition || '',
      notes: row.notes || '',
    }));

    return cachedMetricKeys;
  } catch (err) {
    console.warn('Failed to load metric keys from CSV, using empty set:', err);
    return [];
  }
}

// Map CompanyData field names to canonical metric keys
export const FIELD_TO_METRIC_KEY: Record<string, string> = {
  'totalElectricity': 'energy.electricity_kwh_12m',
  'fuel_natural_gas': 'energy.natural_gas_kwh_12m',
  'fuel_diesel': 'energy.fuel_diesel_l_12m',
  'waterWithdrawal': 'water.withdrawal_m3_12m',
  'totalWaste': 'waste.total_kg_12m',
  'diversionRate': 'waste.recycled_kg_12m',
  'hazardousWaste': 'waste.hazardous_kg_12m',
  'totalFte': 'workforce.headcount_avg_12m',
  'trir': 'workforce.ltifr_12m',
  'scope1Estimate': 'emissions.scope1_tco2e_12m',
  'scope2Location': 'emissions.scope2_tco2e_12m',
  'certificationsHeld': 'governance.code_of_conduct',
};

export function clearConfigCache(): void {
  cachedMappingRules = null;
  cachedMetricKeys = null;
}
