// ============================================================
// DEGRADATIONMATH.JS - Deterministic Physics-Based Aging Models
// ============================================================

/**
 * Calculates State of Health (SoH %) for a given year 't' (0 to 10 years)
 * Based on semi-empirical calendar + cycle aging formulation.
 *
 * @param {number} t - Time in years (0 to 10)
 * @param {number} ambientTemp - Regional ambient temperature in Celsius
 * @param {number} totalCyclesPerYear - Annual equivalent full cycles
 * @param {number} fastChargeRatio - Fast-charging usage percentage (0-100)
 * @param {string} chemistry - 'NMC' or 'LFP'
 * @returns {number} State of Health percentage (0 to 100)
 */
function calculateSoH(t, ambientTemp, totalCyclesPerYear, fastChargeRatio, chemistry) {
  // LFP chemistry possesses higher chemical stability than NMC
  const cChem = (chemistry === 'LFP') ? 0.72 : 1.00;

  // Calendar Aging Component (Arrhenius temperature dependency & t^0.5 diffusion decay)
  const tempFactor = 1 + 0.032 * (ambientTemp - 25);
  const calendarDecay = 1.45 * Math.sqrt(Math.max(0, t)) * Math.max(0.6, tempFactor);

  // Cycling Component (Cycle throughput & C-rate stress from fast charging)
  const totalCumulativeCycles = totalCyclesPerYear * t;
  const fastChargeStress = 1 + 0.55 * (fastChargeRatio / 100);
  const cycleDecay = 0.022 * Math.sqrt(Math.max(0, totalCumulativeCycles)) * fastChargeStress;

  // Total degradation
  const totalLoss = (calendarDecay + cycleDecay) * cChem;
  const soh = 100 - totalLoss;

  return Math.max(0, Math.min(100, parseFloat(soh.toFixed(2))));
}

/**
 * Splits loss into calendar vs cycle components for year 't'
 */
function calculateLossBreakdown(t, ambientTemp, totalCyclesPerYear, fastChargeRatio, chemistry) {
  const cChem = (chemistry === 'LFP') ? 0.72 : 1.00;
  const tempFactor = 1 + 0.032 * (ambientTemp - 25);
  const calendarDecay = 1.45 * Math.sqrt(Math.max(0, t)) * Math.max(0.6, tempFactor);
  const totalCumulativeCycles = totalCyclesPerYear * t;
  const fastChargeStress = 1 + 0.55 * (fastChargeRatio / 100);
  const cycleDecay = 0.022 * Math.sqrt(Math.max(0, totalCumulativeCycles)) * fastChargeStress;

  return {
    calendarLoss: parseFloat((calendarDecay * cChem).toFixed(2)),
    cycleLoss: parseFloat((cycleDecay * cChem).toFixed(2)),
    totalLoss: parseFloat(((calendarDecay + cycleDecay) * cChem).toFixed(2))
  };
}

/**
 * Generates 10-year projection array (Year 0 through Year 10)
 */
function generate10YearProjection(ambientTemp, dailyKm, fastChargeRatio, chemistry) {
  const totalCyclesPerYear = (dailyKm * 365) / 300; // 300km per full cycle
  const projection = [];

  for (let year = 0; year <= 10; year++) {
    projection.push({
      year: year,
      soh: calculateSoH(year, ambientTemp, totalCyclesPerYear, fastChargeRatio, chemistry)
    });
  }
  return projection;
}

/**
 * Generates series for stacked bar chart: calendar and cycle loss for years 0 to 10
 */
function generateBreakdownSeries(ambientTemp, dailyKm, fastChargeRatio, chemistry) {
  const totalCyclesPerYear = (dailyKm * 365) / 300;
  const calendarSeries = [];
  const cycleSeries = [];

  for (let year = 0; year <= 10; year++) {
    const breakdown = calculateLossBreakdown(year, ambientTemp, totalCyclesPerYear, fastChargeRatio, chemistry);
    calendarSeries.push(breakdown.calendarLoss);
    cycleSeries.push(breakdown.cycleLoss);
  }

  return { calendarSeries, cycleSeries };
}

/**
 * Analytical second-life transition calculation (Year battery reaches threshold, default 70% SoH)
 */
function calculateSecondLifeYears(ambientTemp, dailyKm, fastChargeRatio, chemistry, thresholdSoH = 70) {
  const cChem = (chemistry === 'LFP') ? 0.72 : 1.00;
  const nAnnual = (dailyKm * 365) / 300;
  const targetLoss = 100 - thresholdSoH;

  const tempFactor = 1 + 0.032 * (ambientTemp - 25);
  const fastChargeStress = 1 + 0.55 * (fastChargeRatio / 100);

  const denominator = cChem * (
    1.45 * Math.max(0.6, tempFactor) +
    0.022 * Math.sqrt(nAnnual) * fastChargeStress
  );

  if (denominator <= 0) return Infinity;
  const years = Math.pow(targetLoss / denominator, 2);
  return parseFloat(years.toFixed(1));
}

/**
 * Tornado-style sensitivity analysis: holds others fixed, sweeps each factor min->max
 */
function calculateSensitivity(current) {
  const ranges = {
    fastCharge: { min: 0,   max: 100, label: 'Fast Charge %' },
    temp:       { min: -10, max: 50,  label: 'Ambient Temp' },
    distance:   { min: 10,  max: 200, label: 'Daily Distance' }
  };

  const results = [];

  Object.keys(ranges).forEach((key) => {
    const range = ranges[key];

    const withValue = (overrideKey, value) => {
      const p = { ...current };
      p[overrideKey] = value;
      const cyclesPerYear = (p.distance * 365) / 300;
      return calculateSoH(10, p.temp, cyclesPerYear, p.fastCharge, p.chemistry);
    };

    const sohAtMin = withValue(key, range.min);
    const sohAtMax = withValue(key, range.max);

    results.push({
      label: range.label,
      lo: parseFloat(Math.min(sohAtMin, sohAtMax).toFixed(1)),
      hi: parseFloat(Math.max(sohAtMin, sohAtMax).toFixed(1)),
      delta: parseFloat(Math.abs(sohAtMax - sohAtMin).toFixed(1))
    });
  });

  return results;
}

/**
 * Monthly-resolution projection for threshold markers and forecasts
 */
function generateMonthlyProjection(ambientTemp, dailyKm, fastChargeRatio, chemistry, totalMonths = 120) {
  const totalCyclesPerYear = (dailyKm * 365) / 300;
  const startDate = new Date();
  const projection = [];

  for (let m = 0; m <= totalMonths; m++) {
    const t = m / 12; // fractional years
    const soh = calculateSoH(t, ambientTemp, totalCyclesPerYear, fastChargeRatio, chemistry);
    const d = new Date(startDate.getFullYear(), startDate.getMonth() + m, 1);

    projection.push({
      month: m,
      label: d.toLocaleString('en-US', { month: 'short', year: 'numeric' }),
      soh: soh
    });
  }
  return projection;
}
