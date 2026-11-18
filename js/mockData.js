// ============================================================
// MOCKDATA.JS - Synthetic 4-Pack Battery Profiles & NASA Model Loader
// ============================================================

/**
 * 4 SYNTHETIC BATTERY PACK DATA PROFILES:
 * -------------------------------------------------------------
 * Pack 1: NMC — Good Health (Controlled climate, low fast-charge, high SoH)
 * Pack 2: NMC — Bad Health (Thermal stress + 85% fast-charge, caution zone 76.8%)
 * Pack 3: LFP — Good Health (Fleet cycle, low degradation, SoH 96.8%)
 * Pack 4: LFP — Bad Health (Extreme C-rate stress + heat, critical 72.4%)
 */

const BATTERY_PACK_PROFILES = {
  'pack-1': {
    id: 'pack-1',
    name: 'Battery Pack #1',
    label: 'Pack #1: NMC (Optimal Health)',
    badge: 'Good Health',
    chemistry: 'NMC',
    description: 'City commute / mild climate (24°C), 15% fast-charging, regular overnight AC charging.',
    nominalVoltage: 24.0,
    nominalCapacityKWh: 50,
    currentStatus: {
      voltage: 24.4,
      current: -85,       // mA
      temp: 24.5,         // °C
      soc: 68,            // %
      soh: 95.2,          // %
      rangeKm: 142
    },
    simDefaults: {
      chemistry: 'NMC',
      ambientTemp: 24,
      fastChargeRatio: 15,
      dailyDistanceKm: 40
    },
    mlForecast: {
      simulatedSoH: 95.2,
      rulMonths: 92,      // 7 Years, 8 Months to 75%
      rulFormatted: '7 Years, 8 Months',
      rulSubtext: 'Until target 75.0% SoH second-life gate · Model confidence 94.3% (±1.4 mo)',
      secondLifeYears: 13.8,
      statusLabel: 'OPTIMAL: Active Automotive Grade (>80%)',
      statusColor: '#00FF88',
      stabilityIndex: '99.2%',
      aiAnomaly: 'Notice: Normal cycle variance. Optimal solid-electrolyte interphase (SEI) stability.',
      aiOptimization: '• Continue standard 80% daily charge limits to achieve >12 years active automotive service.'
    }
  },

  'pack-2': {
    id: 'pack-2',
    name: 'Battery Pack #2',
    label: 'Pack #2: NMC (Thermal Stressed — Bad Health)',
    badge: 'Bad Health (Stressed)',
    chemistry: 'NMC',
    description: 'Severe desert heat (42°C), 85% continuous DC fast-charging, heavy daily mileage (130 km/day).',
    nominalVoltage: 24.0,
    nominalCapacityKWh: 50,
    currentStatus: {
      voltage: 22.6,
      current: -320,      // mA
      temp: 42.3,         // °C (TRIGGERS OVERHEAT FLASH WARNING)
      soc: 42,            // %
      soh: 76.8,          // % (INSIDE 70%-80% TRANSITION WARNING ZONE!)
      rangeKm: 88
    },
    simDefaults: {
      chemistry: 'NMC',
      ambientTemp: 42,
      fastChargeRatio: 85,
      dailyDistanceKm: 130
    },
    mlForecast: {
      simulatedSoH: 76.8,
      rulMonths: 9,       // 9 Months to 75%
      rulFormatted: '9 Months (Warning: Critical Fade)',
      rulSubtext: 'Approaching 75.0% SoH assessment gate · Model confidence 94.3% (±0.9 mo)',
      secondLifeYears: 3.8,
      statusLabel: 'CAUTION: 70%–80% Second-Life Transition Zone',
      statusColor: '#FFB454',
      stabilityIndex: '78.4%',
      aiAnomaly: 'ALERT: Rapid capacity fade & thermal spikes (+42°C). High internal resistance growth detected.',
      aiOptimization: '• Cease high-rate DC charging immediately. Pre-cool pack before low-rate AC charge. Prepare decommission for BESS grid storage within 9 months.'
    }
  },

  'pack-3': {
    id: 'pack-3',
    name: 'Battery Pack #3',
    label: 'Pack #3: LFP (Resilient Fleet — Good Health)',
    badge: 'Good Health',
    chemistry: 'LFP',
    description: 'Commercial delivery fleet, temperate climate (24°C), standard 20% fast-charging ratio.',
    nominalVoltage: 48.0,
    nominalCapacityKWh: 60,
    currentStatus: {
      voltage: 25.1,
      current: +220,      // mA (Actively regenerative charging)
      temp: 25.2,         // °C
      soc: 75,            // %
      soh: 96.8,          // %
      rangeKm: 160
    },
    simDefaults: {
      chemistry: 'LFP',
      ambientTemp: 24,
      fastChargeRatio: 20,
      dailyDistanceKm: 60
    },
    mlForecast: {
      simulatedSoH: 96.8,
      rulMonths: 136,     // 11 Years, 4 Months
      rulFormatted: '11 Years, 4 Months',
      rulSubtext: 'Until target 75.0% SoH second-life gate · LFP intrinsic safety index 99.8%',
      secondLifeYears: 16.5,
      statusLabel: 'OPTIMAL: Active Automotive Grade (>80%)',
      statusColor: '#00FF88',
      stabilityIndex: '99.8%',
      aiAnomaly: 'Status: Ultra-stable open-circuit voltage plateau. Zero lithium dendrite nucleation detected.',
      aiOptimization: '• Perform monthly 100% calibration cycle for BMS Coulomb-counting precision.'
    }
  },

  'pack-4': {
    id: 'pack-4',
    name: 'Battery Pack #4',
    label: 'Pack #4: LFP (High C-Rate Stressed — Bad Health)',
    badge: 'Critical Health (Near EoL)',
    chemistry: 'LFP',
    description: 'Multi-shift commercial duty, extreme tropical ambient (44°C), 95% continuous ultra-fast charging.',
    nominalVoltage: 48.0,
    nominalCapacityKWh: 60,
    currentStatus: {
      voltage: 21.8,
      current: -440,      // mA
      temp: 43.8,         // °C (TRIGGERS OVERHEAT WARNING)
      soc: 31,            // %
      soh: 72.4,          // % (APPROACHING 70% SECOND-LIFE CUTOFF)
      rangeKm: 65
    },
    simDefaults: {
      chemistry: 'LFP',
      ambientTemp: 44,
      fastChargeRatio: 95,
      dailyDistanceKm: 170
    },
    mlForecast: {
      simulatedSoH: 72.4,
      rulMonths: 0,
      rulFormatted: '0 Months (75% Gate Reached)',
      rulSubtext: 'Pack is below 75% threshold · 1 Year, 1 Month remaining to 70.0% BESS cut-off',
      secondLifeYears: 4.9,
      statusLabel: 'CRITICAL: Second-Life Retirement Candidate (<75%)',
      statusColor: '#FF5C5C',
      stabilityIndex: '69.1%',
      aiAnomaly: 'CRITICAL: Excessive high C-rate cycling at elevated temp. Anode over-potential hazard.',
      aiOptimization: '• MANDATORY ACTION: Decommission from EV traction. Re-certificate pack for stationary second-life battery energy storage system (BESS).'
    }
  }
};

/**
 * Generates 720 rows (12 hours of 1-minute telemetry) customized for a specific pack
 */
function generatePackTelemetryLogs(packId) {
  const profile = BATTERY_PACK_PROFILES[packId] || BATTERY_PACK_PROFILES['pack-1'];
  const logs = [];
  const now = new Date();

  const baseVoltage = profile.currentStatus.voltage;
  const baseCurrent = profile.currentStatus.current;
  const baseTemp = profile.currentStatus.temp;
  const baseSoc = profile.currentStatus.soc;

  for (let i = 719; i >= 0; i--) {
    const timeOffset = new Date(now.getTime() - i * 60000);
    const jitterV = (Math.sin(i * 0.1) * 0.15) + ((Math.random() - 0.5) * 0.08);
    const jitterI = (Math.cos(i * 0.05) * 15) + ((Math.random() - 0.5) * 10);
    const jitterT = (Math.sin(i * 0.02) * 1.2) + ((Math.random() - 0.5) * 0.4);
    const socDrift = Math.max(5, Math.min(100, baseSoc + (Math.sin(i * 0.015) * 6)));

    logs.push({
      date: timeOffset.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      time: timeOffset.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
      soc: parseFloat(socDrift.toFixed(1)),
      voltage: parseFloat((baseVoltage + jitterV).toFixed(2)),
      current: parseFloat((baseCurrent + jitterI).toFixed(0)),
      temp: parseFloat((baseTemp + jitterT).toFixed(1))
    });
  }

  return logs;
}

// Generate logs cache for all 4 packs
const ALL_PACKS_LOGS = {
  'pack-1': generatePackTelemetryLogs('pack-1'),
  'pack-2': generatePackTelemetryLogs('pack-2'),
  'pack-3': generatePackTelemetryLogs('pack-3'),
  'pack-4': generatePackTelemetryLogs('pack-4')
};

/**
 * Generates live next point tailored to current active pack
 */
function generateNextLivePointForPack(packId) {
  const profile = BATTERY_PACK_PROFILES[packId] || BATTERY_PACK_PROFILES['pack-1'];
  const now = new Date();
  const jitterV = (Math.random() - 0.5) * 0.12;
  const jitterI = (Math.random() - 0.5) * 12;
  const jitterT = (Math.random() - 0.5) * 0.4;

  return {
    date: now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
    soc: parseFloat((profile.currentStatus.soc + (Math.random() - 0.5) * 0.3).toFixed(1)),
    voltage: parseFloat((profile.currentStatus.voltage + jitterV).toFixed(2)),
    current: parseFloat((profile.currentStatus.current + jitterI).toFixed(0)),
    temp: parseFloat((profile.currentStatus.temp + jitterT).toFixed(1))
  };
}

/**
 * Standard ESP32 hardware payload matching plan §2.2
 */
function generateMockHardwarePayload(prevData = null, packId = 'pack-1') {
  const profile = BATTERY_PACK_PROFILES[packId] || BATTERY_PACK_PROFILES['pack-1'];
  const now = new Date();

  const voltageJitter = (Math.random() - 0.5) * 0.12;
  const currentJitter = (Math.random() - 0.5) * 10;
  const tempJitter = (Math.random() - 0.5) * 0.3;

  return {
    timestamp: now.toISOString(),
    pack_voltage: parseFloat((profile.currentStatus.voltage + voltageJitter).toFixed(2)),
    current_amps: parseFloat((profile.currentStatus.current + currentJitter).toFixed(1)),
    temperature_c: parseFloat((profile.currentStatus.temp + tempJitter).toFixed(1)),
    state_of_charge_percent: profile.currentStatus.soc,
    state_of_health_percent: profile.currentStatus.soh
  };
}
