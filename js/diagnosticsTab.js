// ============================================================
// DIAGNOSTICSTAB.JS - Controller for Semi-Empirical Diagnostics
// ============================================================

const DiagnosticsController = {
  initialized: false,

  init() {
    if (this.initialized) {
      this.syncWithAppState();
      return;
    }

    // Grab controls
    this.chemToggleNmc = document.getElementById('chemToggleNmc');
    this.chemToggleLfp = document.getElementById('chemToggleLfp');
    this.chemActiveBadge = document.getElementById('chemActiveBadge');
    this.tempSlider = document.getElementById('tempSlider');
    this.tempBadge = document.getElementById('tempBadge');
    this.fastChargeSlider = document.getElementById('fastChargeSlider');
    this.fastChargeBadge = document.getElementById('fastChargeBadge');
    this.distanceSlider = document.getElementById('distanceSlider');
    this.distanceBadge = document.getElementById('distanceBadge');
    this.btnResetSim = document.getElementById('btnResetSim');

    // Output cards elements
    this.cardTotalLoss = document.getElementById('cardTotalLoss');
    this.cardCalendarLoss = document.getElementById('cardCalendarLoss');
    this.cardCycleLoss = document.getElementById('cardCycleLoss');
    this.cardSecondLife = document.getElementById('cardSecondLife');

    if (!this.tempSlider) {
      console.warn('[Diagnostics] DOM elements not yet present');
      return;
    }

    this.bindEvents();
    this.initCharts();
    this.syncWithAppState();
    this.initialized = true;
    console.log('✓ Diagnostics Tab Initialized');
  },

  bindEvents() {
    // Chemistry toggles
    if (this.chemToggleNmc && this.chemToggleLfp) {
      this.chemToggleNmc.addEventListener('change', () => {
        if (this.chemToggleNmc.checked) {
          if (this.chemActiveBadge) this.chemActiveBadge.textContent = 'NMC';
          this.onParamChange('chemistry', 'NMC');
        }
      });
      this.chemToggleLfp.addEventListener('change', () => {
        if (this.chemToggleLfp.checked) {
          if (this.chemActiveBadge) this.chemActiveBadge.textContent = 'LFP';
          this.onParamChange('chemistry', 'LFP');
        }
      });
    }

    // Temperature slider
    if (this.tempSlider) {
      this.tempSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (this.tempBadge) this.tempBadge.textContent = `${val > 0 ? '+' : ''}${val}°C`;
        this.onParamChange('ambientTemp', val);
      });
    }

    // Fast-charge slider
    if (this.fastChargeSlider) {
      this.fastChargeSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        if (this.fastChargeBadge) this.fastChargeBadge.textContent = `${val}%`;
        this.onParamChange('fastChargeRatio', val);
      });
    }

    // Daily distance slider
    if (this.distanceSlider) {
      this.distanceSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        if (this.distanceBadge) this.distanceBadge.textContent = `${val} km`;
        this.onParamChange('dailyDistanceKm', val);
      });
    }

    // Reset button
    if (this.btnResetSim) {
      this.btnResetSim.addEventListener('click', () => this.resetDefaults());
    }

    // Subscribe to pack changes from header selector or walkthrough modal
    if (window.AppState) {
      window.AppState.subscribe('packChange', () => {
        this.syncWithAppState();
      });
    }
  },

  syncWithAppState() {
    const sim = window.AppState ? window.AppState.get('simulation') : null;
    if (!sim) return;

    if (sim.chemistry === 'LFP') {
      if (this.chemToggleLfp) this.chemToggleLfp.checked = true;
      if (this.chemActiveBadge) this.chemActiveBadge.textContent = 'LFP';
    } else {
      if (this.chemToggleNmc) this.chemToggleNmc.checked = true;
      if (this.chemActiveBadge) this.chemActiveBadge.textContent = 'NMC';
    }

    if (this.tempSlider) this.tempSlider.value = sim.ambientTemp;
    if (this.tempBadge) this.tempBadge.textContent = `${sim.ambientTemp > 0 ? '+' : ''}${sim.ambientTemp}°C`;

    if (this.fastChargeSlider) this.fastChargeSlider.value = sim.fastChargeRatio;
    if (this.fastChargeBadge) this.fastChargeBadge.textContent = `${sim.fastChargeRatio}%`;

    if (this.distanceSlider) this.distanceSlider.value = sim.dailyDistanceKm;
    if (this.distanceBadge) this.distanceBadge.textContent = `${sim.dailyDistanceKm} km`;

    this.updateCalculations();
  },

  onParamChange(key, value) {
    if (window.AppState) {
      window.AppState.set('simulation', { [key]: value });
    }
    this.updateCalculations();
  },

  resetDefaults() {
    const packId = window.AppState ? window.AppState.get('activePackId') : 'pack-1';
    const profile = (typeof BATTERY_PACK_PROFILES !== 'undefined' && BATTERY_PACK_PROFILES[packId])
      ? BATTERY_PACK_PROFILES[packId]
      : null;

    const defaults = profile ? profile.simDefaults : {
      chemistry: 'NMC',
      ambientTemp: 24,
      fastChargeRatio: 15,
      dailyDistanceKm: 40
    };

    if (window.AppState) {
      window.AppState.set('simulation', defaults);
    }
    this.syncWithAppState();
  },

  initCharts() {
    initDegradationChart('degradationChart');
    initBreakdownChart('breakdownChart');
    initSensitivityChart('sensitivityChart');
  },

  updateCalculations() {
    const sim = window.AppState ? window.AppState.get('simulation') : {
      chemistry: 'NMC',
      ambientTemp: 24,
      fastChargeRatio: 15,
      dailyDistanceKm: 40
    };

    // 1. Calculate 10-year projection
    const projection = generate10YearProjection(
      sim.ambientTemp,
      sim.dailyDistanceKm,
      sim.fastChargeRatio,
      sim.chemistry
    );

    // Update degradation line chart
    if (degradationChartInstance) {
      const sohValues = projection.map(p => p.soh);
      degradationChartInstance.data.datasets[1].data = sohValues;
      degradationChartInstance.update();
    }

    // 2. Calculate breakdown series
    const breakdown = generateBreakdownSeries(
      sim.ambientTemp,
      sim.dailyDistanceKm,
      sim.fastChargeRatio,
      sim.chemistry
    );

    if (breakdownChartInstance) {
      breakdownChartInstance.data.datasets[0].data = breakdown.calendarSeries;
      breakdownChartInstance.data.datasets[1].data = breakdown.cycleSeries;
      breakdownChartInstance.update();
    }

    // 3. Calculate sensitivity tornado
    const sensitivityData = calculateSensitivity({
      temp: sim.ambientTemp,
      fastCharge: sim.fastChargeRatio,
      distance: sim.dailyDistanceKm,
      chemistry: sim.chemistry
    });

    if (sensitivityChartInstance) {
      sensitivityChartInstance.data.datasets[0].data = sensitivityData.map(s => s.delta);
      sensitivityChartInstance.update();
    }

    // 4. Update Output Cards
    const year10Breakdown = calculateLossBreakdown(
      10,
      sim.ambientTemp,
      (sim.dailyDistanceKm * 365) / 300,
      sim.fastChargeRatio,
      sim.chemistry
    );

    const secondLifeYears = calculateSecondLifeYears(
      sim.ambientTemp,
      sim.dailyDistanceKm,
      sim.fastChargeRatio,
      sim.chemistry,
      70
    );

    if (this.cardTotalLoss) {
      this.cardTotalLoss.textContent = `${year10Breakdown.totalLoss.toFixed(1)}%`;
    }
    if (this.cardCalendarLoss) {
      this.cardCalendarLoss.textContent = `${year10Breakdown.calendarLoss.toFixed(1)}%`;
    }
    if (this.cardCycleLoss) {
      this.cardCycleLoss.textContent = `${year10Breakdown.cycleLoss.toFixed(1)}%`;
    }
    if (this.cardSecondLife) {
      if (secondLifeYears === Infinity || secondLifeYears > 30) {
        this.cardSecondLife.textContent = '> 25 Years';
      } else {
        this.cardSecondLife.textContent = `${secondLifeYears.toFixed(1)} Years`;
      }
    }
  }
};

window.DiagnosticsController = DiagnosticsController;
