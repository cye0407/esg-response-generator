import { describe, it, expect } from 'vitest';
import { retrieveDataForCompany } from '../dataRetrieval';
import type { MatchResult, CompanyData } from '../types';

const baseCompany: CompanyData = {
  companyName: 'Acme Corp', industry: 'Manufacturing', country: 'Germany',
  employeeCount: 500, numberOfSites: 3, reportingPeriod: 'Jan 2024 - Dec 2024', revenueBand: '10M-50M EUR',
  electricityKwh: 1000000, renewablePercent: 40, naturalGasM3: 50000, dieselLiters: 10000,
  waterM3: 5000, totalWasteKg: 200000, recyclingPercent: 65, hazardousWasteKg: 5000,
  femalePercent: 35, trainingHoursPerEmployee: 20, trirRate: 1.5, lostTimeIncidents: 3, fatalities: 0,
  certifications: 'ISO 14001, ISO 45001', sustainabilityGoal: 'Net zero by 2035',
};

function match(primary: string, topics: string[] = []): MatchResult {
  return {
    questionId: 'q1', primaryDomain: primary as any, secondaryDomains: [],
    topics: topics as any[], confidence: 'high', matchedKeywords: [], suggestedDataPoints: [],
  };
}

describe('retrieveDataForCompany', () => {
  it('retrieves energy data for energy_electricity domain', () => {
    const ctx = retrieveDataForCompany(match('energy_electricity', ['energy_consumption']), baseCompany);
    expect(ctx.operational.some(p => p.field === 'totalElectricity')).toBe(true);
    expect(ctx.operational.find(p => p.field === 'totalElectricity')?.value).toBe(1000000);
  });

  it('estimates Scope 1 from fuel data when not provided', () => {
    const data = { ...baseCompany, scope1Tco2e: undefined };
    const ctx = retrieveDataForCompany(match('emissions', ['ghg_emissions', 'scope_1']), data);
    const s1 = ctx.calculated.find(p => p.field === 'scope1Estimate');
    expect(s1).toBeDefined();
    expect(s1!.confidence).toBe('medium');
    expect(s1!.value).toBeGreaterThan(0);
  });

  it('uses provided Scope 1 directly when available', () => {
    const data = { ...baseCompany, scope1Tco2e: 250 };
    const ctx = retrieveDataForCompany(match('emissions', ['ghg_emissions']), data);
    const s1 = ctx.calculated.find(p => p.field === 'scope1Estimate');
    expect(s1!.value).toBe(250);
    expect(s1!.confidence).toBe('high');
  });

  it('reports data gaps when data missing', () => {
    const empty: CompanyData = { companyName: '', industry: '', country: '', employeeCount: 0, numberOfSites: 1, reportingPeriod: '', revenueBand: '' };
    const ctx = retrieveDataForCompany(match('energy_electricity'), empty);
    expect(ctx.metadata.dataGaps.length).toBeGreaterThan(0);
  });

  it('retrieves waste data correctly', () => {
    const ctx = retrieveDataForCompany(match('waste', ['waste_management']), baseCompany);
    expect(ctx.operational.find(p => p.field === 'totalWaste')?.value).toBe(200000);
    expect(ctx.operational.find(p => p.field === 'diversionRate')?.value).toBe(65);
    expect(ctx.operational.find(p => p.field === 'hazardousWaste')?.value).toBe(5000);
  });

  it('retrieves health and safety metrics', () => {
    const ctx = retrieveDataForCompany(match('health_safety', ['health_safety']), baseCompany);
    expect(ctx.operational.find(p => p.field === 'trir')?.value).toBe(1.5);
    expect(ctx.operational.find(p => p.field === 'fatalities')?.value).toBe(0);
  });

  it('calculates total training hours', () => {
    const ctx = retrieveDataForCompany(match('training', ['training']), baseCompany);
    expect(ctx.operational.find(p => p.field === 'totalTrainingHours')?.value).toBe(10000);
  });

  it('deduplicates data points', () => {
    const ctx = retrieveDataForCompany(
      { ...match('company'), secondaryDomains: ['company' as any] },
      baseCompany
    );
    const names = ctx.company.filter(p => p.field === 'legalEntityName');
    expect(names.length).toBe(1);
  });
});
