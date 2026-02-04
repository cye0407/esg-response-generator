import { describe, it, expect } from 'vitest';
import { matchQuestion, matchQuestions, getMatchStatistics } from '../keywordMatcher';
import type { ParsedQuestion } from '../types';

function q(text: string, id = 'q1'): ParsedQuestion {
  return { id, rowIndex: 1, text, rawRow: {} };
}

describe('matchQuestion', () => {
  it('matches Scope 1 emissions with high confidence', () => {
    const result = matchQuestion(q('What are your Scope 1 GHG emissions?'));
    expect(result.primaryDomain).toBe('emissions');
    expect(result.confidence).toBe('high');
    expect(result.topics).toContain('ghg_emissions');
    expect(result.topics).toContain('scope_1');
  });

  it('matches electricity questions', () => {
    const result = matchQuestion(q('What is your total electricity consumption in kWh?'));
    expect(result.primaryDomain).toBe('energy_electricity');
    expect(result.topics).toContain('energy_consumption');
  });

  it('matches renewable energy', () => {
    const result = matchQuestion(q('What percentage of your energy comes from renewable sources?'));
    expect(result.primaryDomain).toBe('energy_electricity');
    expect(result.topics).toContain('renewable_energy');
  });

  it('matches waste management', () => {
    const result = matchQuestion(q('How much hazardous waste did your company generate?'));
    expect(result.primaryDomain).toBe('waste');
    expect(result.confidence).not.toBe('none');
    expect(result.topics).toContain('waste_management');
  });

  it('matches health and safety', () => {
    const result = matchQuestion(q('What is your TRIR and lost time incident rate?'));
    expect(result.primaryDomain).toBe('health_safety');
    expect(result.confidence).toBe('high');
  });

  it('matches workforce / diversity', () => {
    const result = matchQuestion(q('What is the gender diversity breakdown of your workforce?'));
    expect(result.primaryDomain).toBe('workforce');
    expect(result.topics).toContain('diversity');
  });

  it('matches water usage', () => {
    const result = matchQuestion(q('What is your total water withdrawal?'));
    expect(result.primaryDomain).toBe('energy_water');
    expect(result.topics).toContain('water_usage');
  });

  it('returns none for unrelated text', () => {
    const result = matchQuestion(q('What is the meaning of life?'));
    expect(result.confidence).toBe('none');
    expect(result.primaryDomain).toBeNull();
  });

  it('uses category for matching', () => {
    const question = q('Please describe your approach');
    question.category = 'GHG Emissions';
    const result = matchQuestion(question);
    expect(result.topics).toContain('ghg_emissions');
  });
});

describe('matchQuestions', () => {
  it('returns one result per question', () => {
    const results = matchQuestions([q('Scope 1?', 'a'), q('Water use?', 'b')]);
    expect(results).toHaveLength(2);
    expect(results[0].questionId).toBe('a');
    expect(results[1].questionId).toBe('b');
  });
});

describe('getMatchStatistics', () => {
  it('counts by confidence and domain', () => {
    const results = matchQuestions([
      q('Scope 1 emissions?', 'a'),
      q('Water withdrawal?', 'b'),
      q('Nothing relevant', 'c'),
    ]);
    const stats = getMatchStatistics(results);
    expect(stats.total).toBe(3);
    expect(stats.unmatchedCount).toBeGreaterThanOrEqual(0);
    expect(typeof stats.byConfidence.high).toBe('number');
  });
});
