import type { ParsedQuestion, MatchResult, DataContext, AnswerDraft, GenerationConfig, RetrievedDataPoint } from './types';
import { FIELD_TO_METRIC_KEY } from './configLoader';

interface AnswerTemplate {
  domains: string[];
  topics: string[];
  generate: (dataMap: Map<string, RetrievedDataPoint>, framework?: string) => string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function val(dataMap: Map<string, RetrievedDataPoint>, field: string): string | number | boolean | null {
  const p = dataMap.get(field);
  return p?.value ?? null;
}

function has(dataMap: Map<string, RetrievedDataPoint>, ...fields: string[]): boolean {
  return fields.every(f => {
    const v = val(dataMap, f);
    return v !== null && v !== undefined && v !== '' && v !== 0;
  });
}

function num(dataMap: Map<string, RetrievedDataPoint>, field: string): number {
  const v = val(dataMap, field);
  return typeof v === 'number' ? v : 0;
}

function str(dataMap: Map<string, RetrievedDataPoint>, field: string): string {
  const v = val(dataMap, field);
  return v !== null && v !== undefined ? String(v) : '';
}

function fmt(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

function frameworkNote(framework?: string): string {
  if (!framework) return '';
  const notes: Record<string, string> = {
    CSRD: ' This disclosure is aligned with ESRS reporting requirements under the CSRD.',
    GRI: ' This disclosure follows GRI Standards reporting principles.',
    CDP: ' This information is provided in line with CDP disclosure expectations.',
    EcoVadis: ' This data supports our EcoVadis assessment submission.',
    SASB: ' This metric is reported consistent with SASB industry-specific standards.',
    TCFD: ' This information is disclosed in line with TCFD recommendations.',
  };
  return notes[framework] || '';
}

// ---------------------------------------------------------------------------
// Rich answer templates
// ---------------------------------------------------------------------------

const ANSWER_TEMPLATES: AnswerTemplate[] = [
  // ----- Energy & Electricity -----
  {
    domains: ['energy_electricity'],
    topics: ['energy_consumption', 'renewable_energy'],
    generate: (dm, fw) => {
      if (!has(dm, 'totalElectricity')) return null;
      const kwh = num(dm, 'totalElectricity');
      const renPct = num(dm, 'renewablePercent');
      const period = str(dm, 'reportingPeriod');
      const periodStr = period ? ` during ${period}` : ' during the reporting period';

      let answer = `Our total electricity consumption was ${fmt(kwh)} kWh${periodStr}.`;
      if (renPct > 0) {
        const renKwh = kwh * renPct / 100;
        answer += ` Of this, ${fmt(renPct)}% (approximately ${fmt(renKwh)} kWh) was sourced from renewable energy.`;
        if (renPct >= 50) {
          answer += ' We continue to prioritize the transition to renewable electricity across our operations.';
        } else {
          answer += ' We are actively working to increase our share of renewable electricity.';
        }
      } else {
        answer += ' We are evaluating options to increase our renewable electricity procurement.';
      }
      answer += frameworkNote(fw);
      return answer;
    },
  },

  // ----- GHG Emissions -----
  {
    domains: ['emissions'],
    topics: ['ghg_emissions', 'scope_1', 'scope_2'],
    generate: (dm, fw) => {
      const s1 = num(dm, 'scope1Estimate');
      const s2 = num(dm, 'scope2Location');
      const s2m = num(dm, 'scope2Market');
      if (s1 === 0 && s2 === 0 && !dm.has('scope1Estimate') && !dm.has('scope2Location')) return null;

      const period = str(dm, 'reportingPeriod');
      const periodStr = period ? ` for ${period}` : ' for the reporting period';
      const parts: string[] = [];

      parts.push(`Our greenhouse gas (GHG) emissions${periodStr} are as follows:`);
      if (s1) parts.push(`Scope 1 (direct) emissions: ${fmt(s1)} tCO2e, covering stationary combustion, mobile sources, and any fugitive emissions.`);
      if (s2) {
        parts.push(`Scope 2 (indirect, location-based) emissions: ${fmt(s2)} tCO2e from purchased electricity.`);
        if (s2m) parts.push(`Scope 2 (market-based) emissions: ${fmt(s2m)} tCO2e, reflecting our renewable energy procurement.`);
      }

      const s1Point = dm.get('scope1Estimate');
      const s2Point = dm.get('scope2Location');
      const isEstimate = (s1Point?.confidence === 'medium') || (s2Point?.confidence === 'medium') ||
        (s1Point?.label?.toLowerCase().includes('auto-calculated')) || (s2Point?.label?.toLowerCase().includes('auto-calculated'));
      if (isEstimate) {
        parts.push('Note: Some figures are estimates derived from activity data (fuel consumption, electricity use) and standard emission factors. We are working to improve the granularity of our GHG inventory.');
      }

      const total = s1 + s2;
      if (total > 0) {
        parts.push(`Total Scope 1 + Scope 2 (location-based): ${fmt(total)} tCO2e.`);
      }

      let answer = parts.join(' ');
      answer += frameworkNote(fw);
      return answer;
    },
  },

  // ----- Workforce / Employee Count -----
  {
    domains: ['workforce'],
    topics: ['employee_count'],
    generate: (dm, fw) => {
      if (!has(dm, 'totalFte')) return null;
      const fte = num(dm, 'totalFte');
      const period = str(dm, 'reportingPeriod');
      const country = str(dm, 'headquartersCountry');
      const sites = num(dm, 'numberOfSites');

      let answer = `As of ${period || 'the end of the reporting period'}, our organization employs ${fmt(fte)} full-time equivalent (FTE) employees`;
      if (sites > 1) answer += ` across ${sites} operational sites`;
      if (country) answer += `, headquartered in ${country}`;
      answer += '.';
      answer += frameworkNote(fw);
      return answer;
    },
  },

  // ----- Diversity -----
  {
    domains: ['workforce'],
    topics: ['diversity'],
    generate: (dm, fw) => {
      if (!has(dm, 'totalFte', 'femalePercent')) return null;
      const fte = num(dm, 'totalFte');
      const fem = num(dm, 'femalePercent');
      const male = 100 - fem;

      let answer = `Our workforce of ${fmt(fte)} FTE employees comprises ${fmt(fem)}% female and ${fmt(male)}% male employees.`;
      if (fem >= 40 && fem <= 60) {
        answer += ' We maintain a relatively balanced gender distribution across our organization.';
      } else if (fem < 30) {
        answer += ' We recognize the need to improve gender diversity and are implementing initiatives to attract and retain a more diverse workforce.';
      }
      answer += frameworkNote(fw);
      return answer;
    },
  },

  // ----- Health & Safety -----
  {
    domains: ['health_safety'],
    topics: ['health_safety'],
    generate: (dm, fw) => {
      const trir = num(dm, 'trir');
      const lti = num(dm, 'lostTimeIncidents');
      const fat = num(dm, 'fatalities');
      if (trir === 0 && lti === 0 && fat === 0 && !has(dm, 'trir')) return null;

      const period = str(dm, 'reportingPeriod');
      const periodStr = period ? ` during ${period}` : ' during the reporting period';
      const parts: string[] = [];

      parts.push(`Our occupational health and safety performance${periodStr}:`);
      if (has(dm, 'trir')) parts.push(`Total Recordable Incident Rate (TRIR): ${trir}.`);
      parts.push(`Lost time incidents: ${lti}.`);
      parts.push(`Fatalities: ${fat}.`);

      if (fat === 0 && lti === 0) {
        parts.push('We are pleased to report zero lost time incidents and zero fatalities. Our health and safety management system focuses on proactive hazard identification and continuous improvement.');
      } else if (fat === 0) {
        parts.push('While we recorded zero fatalities, we continue to investigate all incidents to prevent recurrence and strengthen our safety culture.');
      }

      let answer = parts.join(' ');
      answer += frameworkNote(fw);
      return answer;
    },
  },

  // ----- Waste -----
  {
    domains: ['waste'],
    topics: ['waste_management', 'recycling'],
    generate: (dm, fw) => {
      if (!has(dm, 'totalWaste')) return null;
      const waste = num(dm, 'totalWaste');
      const div = num(dm, 'diversionRate');
      const haz = num(dm, 'hazardousWaste');
      const period = str(dm, 'reportingPeriod');
      const periodStr = period ? ` during ${period}` : ' during the reporting period';

      let answer = `Our total waste generated${periodStr} was ${fmt(waste)} kg (${fmt(waste / 1000)} tonnes).`;
      if (div > 0) {
        answer += ` We achieved a waste diversion rate of ${fmt(div)}%, meaning ${fmt(waste * div / 100)} kg was recycled or recovered rather than sent to landfill.`;
      }
      if (haz > 0) {
        answer += ` Of this total, ${fmt(haz)} kg was classified as hazardous waste, managed in accordance with applicable regulations.`;
      }
      if (div >= 75) {
        answer += ' Our high diversion rate reflects our commitment to circular economy principles and waste minimization.';
      } else if (div > 0) {
        answer += ' We continue to implement waste reduction initiatives to improve our diversion rate.';
      }
      answer += frameworkNote(fw);
      return answer;
    },
  },

  // ----- Water -----
  {
    domains: ['energy_water'],
    topics: ['water_usage'],
    generate: (dm, fw) => {
      if (!has(dm, 'waterWithdrawal')) return null;
      const water = num(dm, 'waterWithdrawal');
      const period = str(dm, 'reportingPeriod');
      const periodStr = period ? ` during ${period}` : ' during the reporting period';
      const fte = num(dm, 'totalFte');

      let answer = `Our total water withdrawal${periodStr} was ${fmt(water)} m\u00B3.`;
      if (fte > 0) {
        const perCapita = water / fte;
        answer += ` This equates to approximately ${fmt(perCapita)} m\u00B3 per employee.`;
      }
      answer += ' We monitor water usage across our operations and seek to reduce consumption through efficiency measures.';
      answer += frameworkNote(fw);
      return answer;
    },
  },

  // ----- Company Profile -----
  {
    domains: ['company'],
    topics: ['company_profile', 'employee_count'],
    generate: (dm, fw) => {
      if (!has(dm, 'legalEntityName')) return null;
      const name = str(dm, 'legalEntityName');
      const ind = str(dm, 'industryDescription');
      const country = str(dm, 'headquartersCountry');
      const fte = num(dm, 'totalFte');
      const sites = num(dm, 'numberOfSites');
      const rev = str(dm, 'revenueBand');
      const period = str(dm, 'reportingPeriod');

      let answer = `${name} is ${ind ? `a ${ind} company` : 'an organization'}`;
      if (country) answer += ` headquartered in ${country}`;
      answer += '.';
      if (fte) answer += ` We employ ${fmt(fte)} FTE`;
      if (sites > 1) answer += ` across ${sites} operational sites`;
      if (fte) answer += '.';
      if (rev) answer += ` Revenue band: ${rev}.`;
      if (period) answer += ` This data covers the reporting period ${period}.`;
      answer += frameworkNote(fw);
      return answer;
    },
  },

  // ----- Certifications -----
  {
    domains: ['regulatory'],
    topics: ['certifications'],
    generate: (dm, fw) => {
      if (!has(dm, 'certificationsHeld')) return null;
      const certs = str(dm, 'certificationsHeld');
      let answer = `Our organization holds the following certifications and accreditations: ${certs}. These certifications are maintained through regular external audits and demonstrate our commitment to internationally recognized management standards.`;
      answer += frameworkNote(fw);
      return answer;
    },
  },

  // ----- Training -----
  {
    domains: ['training'],
    topics: ['training'],
    generate: (dm, fw) => {
      if (!has(dm, 'trainingHoursPerEmployee')) return null;
      const perEmp = num(dm, 'trainingHoursPerEmployee');
      const total = num(dm, 'totalTrainingHours');
      const fte = num(dm, 'totalFte');
      const period = str(dm, 'reportingPeriod');
      const periodStr = period ? ` during ${period}` : ' during the reporting period';

      let answer = `${periodStr.charAt(0).toUpperCase() + periodStr.slice(1)}, we delivered an average of ${fmt(perEmp)} training hours per employee.`;
      if (total > 0 && fte > 0) {
        answer += ` This represents a total of ${fmt(total)} hours of training across our ${fmt(fte)} employees.`;
      }
      answer += ' Training programmes cover areas including health and safety, technical skills, and sustainability awareness.';
      answer += frameworkNote(fw);
      return answer;
    },
  },

  // ----- Sustainability Goals / Targets -----
  {
    domains: ['goals'],
    topics: ['targets', 'strategy', 'climate_targets'],
    generate: (dm, fw) => {
      const goal = str(dm, 'primaryGoal');
      if (!goal) return null;
      let answer = `Our primary sustainability commitment is: ${goal}. We are integrating this target into our business strategy and operational planning, and we track progress against this goal as part of our regular management review process.`;
      answer += frameworkNote(fw);
      return answer;
    },
  },

  // ----- Fuel -----
  {
    domains: ['energy_fuel'],
    topics: ['energy_consumption', 'scope_1'],
    generate: (dm, fw) => {
      const gas = num(dm, 'fuel_natural_gas');
      const diesel = num(dm, 'fuel_diesel');
      if (!gas && !diesel) return null;
      const period = str(dm, 'reportingPeriod');
      const periodStr = period ? ` during ${period}` : ' during the reporting period';
      const parts: string[] = [`Our fuel consumption${periodStr}:`];
      if (gas) parts.push(`Natural gas: ${fmt(gas)} m\u00B3.`);
      if (diesel) parts.push(`Diesel: ${fmt(diesel)} litres.`);
      parts.push('Fuel consumption is a key input for our Scope 1 emissions calculation. We are evaluating opportunities to reduce fossil fuel dependency through electrification and energy efficiency measures.');
      let answer = parts.join(' ');
      answer += frameworkNote(fw);
      return answer;
    },
  },
];

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

function findMatchingTemplate(matchResult: MatchResult): AnswerTemplate | null {
  if (!matchResult.primaryDomain) return null;
  const candidates = ANSWER_TEMPLATES.filter(t => {
    const domainMatch = t.domains.includes(matchResult.primaryDomain!) || matchResult.secondaryDomains.some(d => t.domains.includes(d));
    if (!domainMatch) return false;
    return t.topics.some(topic => matchResult.topics.includes(topic as any));
  });
  return candidates.sort((a, b) => {
    const aOverlap = a.topics.filter(t => matchResult.topics.includes(t as any)).length;
    const bOverlap = b.topics.filter(t => matchResult.topics.includes(t as any)).length;
    return bOverlap - aOverlap;
  })[0] || null;
}

function buildDataMap(context: DataContext): Map<string, RetrievedDataPoint> {
  const map = new Map<string, RetrievedDataPoint>();
  [...context.company, ...context.operational, ...context.calculated].forEach(point => {
    map.set(point.field, point);
  });
  return map;
}

function generateSimpleAnswer(
  context: DataContext,
  matchResult: MatchResult,
  framework?: string
): { answer: string; dataValue?: string; dataSource?: string } {
  const dataMap = buildDataMap(context);
  const template = findMatchingTemplate(matchResult);

  if (template) {
    const answer = template.generate(dataMap, framework);
    if (answer) {
      const allPoints = [...context.company, ...context.operational, ...context.calculated];
      const primaryPoint = allPoints[0];
      return {
        answer,
        dataValue: primaryPoint ? `${primaryPoint.value}${primaryPoint.unit ? ' ' + primaryPoint.unit : ''}` : undefined,
        dataSource: primaryPoint?.source as string | undefined,
      };
    }
  }

  // Fallback: build a structured answer from available data points
  const allPoints = [...context.company, ...context.operational, ...context.calculated];
  if (allPoints.length === 0) {
    return { answer: 'We do not currently have sufficient data to provide a complete response to this question. We are working to improve our data collection processes to address this gap in future reporting periods.' };
  }

  const statements = allPoints.slice(0, 5).filter(p => p.value !== null && p.value !== undefined).map(p => {
    if (typeof p.value === 'boolean') return `${p.label}: ${p.value ? 'Yes' : 'No'}`;
    return `${p.label}: ${p.value}${p.unit ? ' ' + p.unit : ''}`;
  });

  if (statements.length === 0) {
    return { answer: 'Insufficient data is currently available to answer this question comprehensively. We are reviewing our data collection processes to ensure this information is available for future reporting.' };
  }

  let answer = 'Based on our available data: ' + statements.join('. ') + '.';
  answer += ' We acknowledge that a more comprehensive response may require additional data collection.';
  answer += frameworkNote(framework);
  return {
    answer,
    dataValue: allPoints[0]?.value !== undefined ? `${allPoints[0].value}${allPoints[0].unit ? ' ' + allPoints[0].unit : ''}` : undefined,
  };
}

function determineConfidence(context: DataContext, matchResult: MatchResult): 'high' | 'medium' | 'low' | 'none' {
  const allPoints = [...context.company, ...context.operational, ...context.calculated];
  if (allPoints.length === 0) return 'none';
  const hasHighConfidence = allPoints.some(p => p.confidence === 'high');
  const hasMediumConfidence = allPoints.some(p => p.confidence === 'medium');
  const hasDataGaps = context.metadata.dataGaps.length > 0;

  if (matchResult.confidence === 'high' && hasHighConfidence && !hasDataGaps) return 'high';
  if (matchResult.confidence !== 'none' && (hasHighConfidence || hasMediumConfidence)) return 'medium';
  if (allPoints.length > 0) return 'low';
  return 'none';
}

export function generateAnswerDraft(
  question: ParsedQuestion,
  matchResult: MatchResult,
  dataContext: DataContext,
  _config: GenerationConfig
): AnswerDraft {
  const framework = question.framework;
  const { answer, dataValue, dataSource } = generateSimpleAnswer(dataContext, matchResult, framework);
  const answerConfidence = determineConfidence(dataContext, matchResult);
  const limitations: string[] = [...dataContext.metadata.dataGaps];
  const assumptions: string[] = [];
  const hasEstimates = dataContext.calculated.some(p => p.label.toLowerCase().includes('estimate') || p.label.toLowerCase().includes('auto-calculated') || p.confidence === 'low' || p.confidence === 'medium');
  if (hasEstimates) assumptions.push('Some values are estimates based on activity data and standard emission factors.');

  // Determine confidenceSource
  let confidenceSource: 'provided' | 'estimated' | 'unknown';
  if (answerConfidence === 'none') {
    confidenceSource = 'unknown';
  } else if (hasEstimates || answerConfidence === 'low') {
    confidenceSource = 'estimated';
  } else {
    confidenceSource = 'provided';
  }

  // Collect metric keys used from data context fields
  const allPoints = [...dataContext.company, ...dataContext.operational, ...dataContext.calculated];
  const metricKeysUsed = [...new Set(
    allPoints.map(p => FIELD_TO_METRIC_KEY[p.field]).filter((k): k is string => !!k)
  )];

  // Merge metric keys from CSV match if available
  const csvExtra = matchResult as MatchResult & { csvMetricKeys?: string[]; csvPromptIfMissing?: string };
  if (csvExtra.csvMetricKeys) {
    for (const k of csvExtra.csvMetricKeys) {
      if (!metricKeysUsed.includes(k)) metricKeysUsed.push(k);
    }
  }

  // Unknown handling: show prompt text when no data
  let finalAnswer = answer;
  let promptForMissing: string | undefined = csvExtra.csvPromptIfMissing || undefined;
  if (confidenceSource === 'unknown') {
    const promptSuffix = promptForMissing ? ` ${promptForMissing}` : '';
    finalAnswer = `Unknown — input required.${promptSuffix}`;
  }

  return {
    questionId: question.id, questionText: question.text, category: question.category,
    matchResult, dataContext,
    answer: finalAnswer, dataValue, dataPeriod: dataContext.metadata.reportingPeriod, dataSource,
    answerConfidence,
    confidenceSource,
    methodology: undefined,
    assumptions: assumptions.length > 0 ? assumptions : undefined,
    limitations: limitations.length > 0 ? limitations : undefined,
    evidence: '',
    metricKeysUsed,
    promptForMissing,
    needsReview: answerConfidence !== 'high',
    isEstimate: hasEstimates,
    hasDataGaps: dataContext.metadata.dataGaps.length > 0
  };
}

export function generateAnswerDrafts(
  questions: ParsedQuestion[], matchResults: MatchResult[], dataContexts: DataContext[], config: GenerationConfig
): AnswerDraft[] {
  return questions.map((q, i) => generateAnswerDraft(q, matchResults[i], dataContexts[i], config));
}

export function buildLLMPrompt(question: ParsedQuestion, dataContext: DataContext, config: GenerationConfig): string {
  const dataPoints = [...dataContext.company, ...dataContext.operational, ...dataContext.calculated];
  const dataSection = dataPoints.length > 0
    ? dataPoints.map(p => `- ${p.label}: ${p.value}${p.unit ? ' ' + p.unit : ''}`).join('\n')
    : 'No relevant data available.';

  const verbosityInstruction = { concise: 'Provide a brief, direct answer (1-2 sentences).', standard: 'Provide a clear, professional answer (2-4 sentences).', detailed: 'Provide a comprehensive answer with context (3-6 sentences).' }[config.verbosity];

  const frameworkInstruction = question.framework
    ? `\n- Align your response with ${question.framework} reporting requirements and terminology.`
    : '';

  return `You are helping a company respond to a sustainability questionnaire. Based on the available data, compose a professional response.

Question: ${question.text}
${question.category ? `Category: ${question.category}` : ''}
${question.framework ? `Framework: ${question.framework}` : ''}

Available Data:
${dataSection}

Instructions:
- ${verbosityInstruction}${frameworkInstruction}
- Use the provided data values accurately.
- If data is incomplete, acknowledge limitations honestly.
- Write in first person plural (we, our).
- Do not make up data that is not provided.

Response:`;
}
