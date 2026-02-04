import { describe, it, expect } from 'vitest';
import {
  getElectricityFactor,
  estimateScope1,
  estimateScope2Location,
  estimateScope2Market,
  SUPPORTED_COUNTRIES,
} from '../emissionFactors';

describe('getElectricityFactor', () => {
  it('returns country-specific factor for Germany', () => {
    const result = getElectricityFactor('Germany');
    expect(result.factor).toBe(0.000385);
    expect(result.isDefault).toBe(false);
    expect(result.source).toContain('Germany');
  });

  it('returns country-specific factor for France (low carbon grid)', () => {
    const result = getElectricityFactor('France');
    expect(result.factor).toBe(0.000052);
    expect(result.factor).toBeLessThan(0.0001);
  });

  it('returns country-specific factor for Poland (high carbon grid)', () => {
    const result = getElectricityFactor('Poland');
    expect(result.factor).toBe(0.000765);
    expect(result.factor).toBeGreaterThan(0.0005);
  });

  it('returns default factor for unknown country', () => {
    const result = getElectricityFactor('Atlantis');
    expect(result.isDefault).toBe(true);
    expect(result.factor).toBe(0.0004);
  });

  it('returns default factor when no country provided', () => {
    const result = getElectricityFactor(undefined);
    expect(result.isDefault).toBe(true);
  });

  it('is case-insensitive', () => {
    const r1 = getElectricityFactor('germany');
    const r2 = getElectricityFactor('GERMANY');
    expect(r1.factor).toBe(r2.factor);
    expect(r1.isDefault).toBe(false);
  });
});

describe('estimateScope1', () => {
  it('calculates from natural gas and diesel', () => {
    const result = estimateScope1(50000, 10000);
    expect(result).toBeGreaterThan(0);
    // 50000 * 0.00202 + 10000 * 0.00268 = 101 + 26.8 = 127.8
    expect(result).toBeCloseTo(127.8, 0);
  });

  it('returns null when no fuel data', () => {
    expect(estimateScope1(undefined, undefined)).toBeNull();
    expect(estimateScope1(0, 0)).toBeNull();
  });

  it('handles gas only', () => {
    const result = estimateScope1(10000, undefined);
    expect(result).toBeCloseTo(20.2, 0);
  });

  it('handles diesel only', () => {
    const result = estimateScope1(undefined, 10000);
    expect(result).toBeCloseTo(26.8, 0);
  });
});

describe('estimateScope2Location', () => {
  it('uses Germany factor for German company', () => {
    const result = estimateScope2Location(1000000, 'Germany');
    expect(result).not.toBeNull();
    // 1000000 * 0.000385 = 385
    expect(result!.value).toBeCloseTo(385, 0);
    expect(result!.source).toContain('Germany');
  });

  it('uses France factor for French company (much lower)', () => {
    const resultDE = estimateScope2Location(1000000, 'Germany');
    const resultFR = estimateScope2Location(1000000, 'France');
    expect(resultFR!.value).toBeLessThan(resultDE!.value);
  });

  it('returns null when no electricity data', () => {
    expect(estimateScope2Location(undefined, 'Germany')).toBeNull();
    expect(estimateScope2Location(0, 'Germany')).toBeNull();
  });
});

describe('estimateScope2Market', () => {
  it('adjusts for renewable percentage', () => {
    const location = estimateScope2Location(1000000, 'Germany');
    const market = estimateScope2Market(1000000, 50, 'Germany');
    expect(market).not.toBeNull();
    // Market should be ~half of location with 50% renewable
    expect(market!.value).toBeCloseTo(location!.value * 0.5, 0);
  });

  it('returns null without renewable percentage', () => {
    expect(estimateScope2Market(1000000, undefined, 'Germany')).toBeNull();
  });

  it('returns zero with 100% renewable', () => {
    const result = estimateScope2Market(1000000, 100, 'Germany');
    expect(result!.value).toBe(0);
  });
});

describe('SUPPORTED_COUNTRIES', () => {
  it('has at least 50 countries', () => {
    expect(SUPPORTED_COUNTRIES.length).toBeGreaterThanOrEqual(50);
  });

  it('is sorted alphabetically', () => {
    const sorted = [...SUPPORTED_COUNTRIES].sort();
    expect(SUPPORTED_COUNTRIES).toEqual(sorted);
  });
});
