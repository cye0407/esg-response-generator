import type { DataDomain, MatchResult, RetrievedDataPoint, DataContext, CompanyData } from './types';
import { estimateScope1, estimateScope2Location, estimateScope2Market } from './emissionFactors';

/**
 * Retrieve data for a matched question using the flat CompanyData input.
 * This replaces the full Zustand store-based retrieval in the main app.
 */
export function retrieveDataForCompany(
  matchResult: MatchResult,
  data: CompanyData
): DataContext {
  const allDomains = [matchResult.primaryDomain, ...matchResult.secondaryDomains].filter((d): d is DataDomain => d !== null);

  const company: RetrievedDataPoint[] = [];
  const operational: RetrievedDataPoint[] = [];
  const calculated: RetrievedDataPoint[] = [];
  const dataGaps: string[] = [];

  for (const domain of allDomains) {
    switch (domain) {
      case 'company':
      case 'site':
        addIfPresent(company, 'company', 'legalEntityName', 'Company Name', data.companyName);
        addIfPresent(company, 'company', 'industryDescription', 'Industry', data.industry);
        addIfPresent(company, 'company', 'headquartersCountry', 'Country', data.country);
        addIfPresent(company, 'company', 'totalFte', 'Total Employees (FTE)', data.employeeCount);
        addIfPresent(company, 'company', 'numberOfSites', 'Number of Sites', data.numberOfSites);
        addIfPresent(company, 'company', 'revenueBand', 'Revenue Band', data.revenueBand);
        addIfPresent(company, 'company', 'reportingPeriod', 'Reporting Period', data.reportingPeriod);
        break;

      case 'energy_electricity':
        if (data.electricityKwh) {
          operational.push({ domain: 'energy_electricity', field: 'totalElectricity', label: 'Total Electricity Consumption', value: data.electricityKwh, unit: 'kWh', period: data.reportingPeriod, confidence: 'high' });
          if (data.renewablePercent !== undefined) {
            operational.push({ domain: 'energy_electricity', field: 'renewablePercent', label: 'Renewable Electricity', value: data.renewablePercent, unit: '%', confidence: 'high' });
          }
        } else {
          dataGaps.push('No electricity consumption data');
        }
        break;

      case 'energy_fuel':
        if (data.naturalGasM3) operational.push({ domain: 'energy_fuel', field: 'fuel_natural_gas', label: 'Natural Gas Consumption', value: data.naturalGasM3, unit: 'm3', confidence: 'high' });
        if (data.dieselLiters) operational.push({ domain: 'energy_fuel', field: 'fuel_diesel', label: 'Diesel Consumption', value: data.dieselLiters, unit: 'L', confidence: 'high' });
        if (!data.naturalGasM3 && !data.dieselLiters) dataGaps.push('No fuel consumption data');
        break;

      case 'energy_water':
        if (data.waterM3) {
          operational.push({ domain: 'energy_water', field: 'waterWithdrawal', label: 'Water Withdrawal', value: data.waterM3, unit: 'm3', confidence: 'high' });
        } else {
          dataGaps.push('No water consumption data');
        }
        break;

      case 'emissions': {
        // Scope 1 — always auto-calculate from fuel data
        if (data.scope1Tco2e !== undefined) {
          calculated.push({ domain: 'emissions', field: 'scope1Estimate', label: 'Scope 1 Emissions (User Provided)', value: data.scope1Tco2e, unit: 'tCO2e', confidence: 'high' });
        } else {
          const scope1 = estimateScope1(data.naturalGasM3, data.dieselLiters);
          if (scope1 !== null) {
            calculated.push({ domain: 'emissions', field: 'scope1Estimate', label: `Scope 1 Emissions (Auto-calculated)`, value: scope1, unit: 'tCO2e', confidence: 'medium' });
          } else {
            dataGaps.push('No fuel data for Scope 1 calculation — enter natural gas or diesel consumption');
          }
        }

        // Scope 2 — auto-calculate using country-specific grid emission factor
        if (data.scope2Tco2e !== undefined) {
          calculated.push({ domain: 'emissions', field: 'scope2Location', label: 'Scope 2 Emissions (User Provided)', value: data.scope2Tco2e, unit: 'tCO2e', confidence: 'high' });
        } else {
          const scope2Location = estimateScope2Location(data.electricityKwh, data.country);
          if (scope2Location) {
            calculated.push({ domain: 'emissions', field: 'scope2Location', label: `Scope 2 Location-Based (Auto-calculated — ${scope2Location.source})`, value: scope2Location.value, unit: 'tCO2e', confidence: 'medium' });
          } else {
            dataGaps.push('No electricity data for Scope 2 calculation — enter electricity consumption');
          }
          const scope2Market = estimateScope2Market(data.electricityKwh, data.renewablePercent, data.country);
          if (scope2Market) {
            calculated.push({ domain: 'emissions', field: 'scope2Market', label: `Scope 2 Market-Based (Auto-calculated — ${scope2Market.source})`, value: scope2Market.value, unit: 'tCO2e', confidence: 'medium' });
          }
        }
        break;
      }

      case 'transport': {
        if (data.scope3Tco2e !== undefined) {
          calculated.push({ domain: 'transport', field: 'scope3Total', label: 'Scope 3 Emissions (User Provided)', value: data.scope3Tco2e, unit: 'tCO2e', confidence: 'high' });
        }
        if (data.scope3Categories) {
          operational.push({ domain: 'transport', field: 'scope3Categories', label: 'Scope 3 Categories Reported', value: data.scope3Categories, confidence: 'high' });
        }
        if (data.businessTravelKm) {
          operational.push({ domain: 'transport', field: 'businessTravel', label: 'Business Travel', value: data.businessTravelKm, unit: 'km', confidence: 'high' });
        }
        if (data.employeeCommuteKm) {
          operational.push({ domain: 'transport', field: 'employeeCommute', label: 'Employee Commuting', value: data.employeeCommuteKm, unit: 'km', confidence: 'high' });
        }
        if (data.freightTonKm) {
          operational.push({ domain: 'transport', field: 'freightTransport', label: 'Freight Transport', value: data.freightTonKm, unit: 'ton-km', confidence: 'high' });
        }
        if (!data.scope3Tco2e && !data.businessTravelKm && !data.employeeCommuteKm && !data.freightTonKm) {
          dataGaps.push('No Scope 3 / transport data');
        }
        break;
      }

      case 'waste':
        if (data.totalWasteKg) {
          operational.push({ domain: 'waste', field: 'totalWaste', label: 'Total Waste Generated', value: data.totalWasteKg, unit: 'kg', confidence: 'high' });
          if (data.recyclingPercent !== undefined) operational.push({ domain: 'waste', field: 'diversionRate', label: 'Waste Diversion Rate', value: data.recyclingPercent, unit: '%', confidence: 'high' });
          if (data.hazardousWasteKg) operational.push({ domain: 'waste', field: 'hazardousWaste', label: 'Hazardous Waste', value: data.hazardousWasteKg, unit: 'kg', confidence: 'high' });
        } else {
          dataGaps.push('No waste data');
        }
        break;

      case 'workforce':
        addIfPresent(operational, 'workforce', 'totalFte', 'Total FTE', data.employeeCount);
        if (data.femalePercent !== undefined) operational.push({ domain: 'workforce', field: 'femalePercent', label: 'Female Employees', value: data.femalePercent, unit: '%', confidence: 'high' });
        if (!data.employeeCount) dataGaps.push('No workforce data');
        break;

      case 'health_safety':
        if (data.trirRate !== undefined) operational.push({ domain: 'health_safety', field: 'trir', label: 'TRIR', value: data.trirRate, confidence: 'high' });
        if (data.lostTimeIncidents !== undefined) operational.push({ domain: 'health_safety', field: 'lostTimeIncidents', label: 'Lost Time Incidents', value: data.lostTimeIncidents, confidence: 'high' });
        if (data.fatalities !== undefined) operational.push({ domain: 'health_safety', field: 'fatalities', label: 'Fatalities', value: data.fatalities, confidence: 'high' });
        break;

      case 'training':
        if (data.trainingHoursPerEmployee !== undefined) {
          operational.push({ domain: 'training', field: 'trainingHoursPerEmployee', label: 'Training Hours per Employee', value: data.trainingHoursPerEmployee, unit: 'hours', confidence: 'high' });
          if (data.employeeCount) {
            operational.push({ domain: 'training', field: 'totalTrainingHours', label: 'Total Training Hours', value: data.trainingHoursPerEmployee * data.employeeCount, unit: 'hours', confidence: 'high' });
            operational.push({ domain: 'training', field: 'employeesTrained', label: 'Employees Trained', value: data.employeeCount, confidence: 'high' });
          }
        }
        break;

      case 'regulatory':
      case 'goals':
        if (data.certifications) company.push({ domain: 'regulatory', field: 'certificationsHeld', label: 'Certifications Held', value: data.certifications, confidence: 'high' });
        if (data.sustainabilityGoal) company.push({ domain: 'goals', field: 'primaryGoal', label: 'Sustainability Goal', value: data.sustainabilityGoal, confidence: 'high' });
        break;

      case 'financial_context':
        addIfPresent(company, 'financial_context', 'revenueBand', 'Revenue Band', data.revenueBand);
        break;
    }
  }

  // Always include company basics for context
  if (company.length === 0 && data.companyName) {
    addIfPresent(company, 'company', 'legalEntityName', 'Company Name', data.companyName);
    addIfPresent(company, 'company', 'industryDescription', 'Industry', data.industry);
  }

  return {
    company: deduplicate(company),
    operational: deduplicate(operational),
    calculated: deduplicate(calculated),
    metadata: {
      reportingPeriod: data.reportingPeriod || undefined,
      sitesIncluded: [],
      dataGaps
    }
  };
}

function addIfPresent(points: RetrievedDataPoint[], domain: DataDomain, field: string, label: string, value: string | number | undefined) {
  if (value !== undefined && value !== '' && value !== 0) {
    points.push({ domain, field, label, value, confidence: 'high' });
  }
}

function deduplicate(points: RetrievedDataPoint[]): RetrievedDataPoint[] {
  const seen = new Set<string>();
  return points.filter(p => {
    const key = `${p.domain}-${p.field}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
