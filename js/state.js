// ============================================================
// STATE.JS - Centralized Reactive State Store
// ============================================================

class AppStateStore {
  constructor() {
    this.state = {
      // Active main tab: 'diagnostics' | 'ml' | 'logs'
      activeTab: 'diagnostics',

      // Active battery pack selection ('pack-1', 'pack-2', 'pack-3', 'pack-4')
      activePackId: 'pack-1',

      // Connection / Hardware Polling State
      connection: {
        mode: 'mock',              // 'mock' | 'live'
        status: 'connected',        // 'connected' | 'disconnected'
        deviceId: 'EV-PACK-001',
        lastSync: new Date(),
        missedUpdates: 0,
        pollingIntervalMs: 60000,   // 60-second hardware ESP32 loop
        liveEndpointUrl: 'http://192.168.4.1/api/telemetry'
      },

      // Current live/mock telemetry reading
      telemetry: {
        timestamp: new Date().toISOString(),
        pack_voltage: 24.4,
        current_amps: -85,
        temperature_c: 24.5,
        state_of_charge_percent: 68,
        state_of_health_percent: 95.2
      },

      // Simulation parameters for Tab 1 (Semi-Empirical Diagnostics)
      simulation: {
        chemistry: 'NMC',
        ambientTemp: 24,
        fastChargeRatio: 15,
        dailyDistanceKm: 40
      },

      // ML Tab specific state
      mlPredictions: {
        simulatedSoH: 95.2,
        targetSoHThreshold: 75.0,
        confidenceLevel: 94.3,
        errorMarginMonths: 1.4,
        rulFormatted: '7 Years, 8 Months',
        statusLabel: 'OPTIMAL: Active Automotive Grade (>80%)',
        statusColor: '#00FF88'
      },

      // Logs table state
      logs: {
        timeRange: '1h',
        currentPage: 1,
        rowsPerPage: 15,
        searchQuery: '',
        isLiveStreaming: false
      }
    };

    this.listeners = new Map();
  }

  // Subscribe to changes on a specific slice of state or wildcard '*'
  subscribe(key, callback) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key).add(callback);
    return () => this.listeners.get(key).delete(callback);
  }

  // Get current state snapshot
  get(key) {
    if (!key) return this.state;
    return this.state[key];
  }

  // Update a slice of state and notify subscribers
  set(key, partialValue) {
    if (typeof partialValue === 'object' && partialValue !== null && !Array.isArray(partialValue)) {
      this.state[key] = { ...this.state[key], ...partialValue };
    } else {
      this.state[key] = partialValue;
    }

    // Trigger subscribers for this key
    if (this.listeners.has(key)) {
      this.listeners.get(key).forEach(cb => cb(this.state[key], this.state));
    }

    // Trigger wildcard subscribers
    if (this.listeners.has('*')) {
      this.listeners.get('*').forEach(cb => cb(key, this.state[key], this.state));
    }
  }

  // Switches active battery pack (1 through 4) and propagates to all tabs
  loadBatteryPack(packId) {
    if (typeof BATTERY_PACK_PROFILES === 'undefined' || !BATTERY_PACK_PROFILES[packId]) return;
    const profile = BATTERY_PACK_PROFILES[packId];

    this.state.activePackId = packId;
    this.set('activePackId', packId);

    // Update telemetry
    this.set('telemetry', {
      timestamp: new Date().toISOString(),
      pack_voltage: profile.currentStatus.voltage,
      current_amps: profile.currentStatus.current,
      temperature_c: profile.currentStatus.temp,
      state_of_charge_percent: profile.currentStatus.soc,
      state_of_health_percent: profile.currentStatus.soh
    });

    // Update simulation defaults for Tab 1
    this.set('simulation', { ...profile.simDefaults });

    // Update ML predictions for Tab 2
    this.set('mlPredictions', {
      simulatedSoH: profile.currentStatus.soh,
      targetSoHThreshold: 75.0,
      confidenceLevel: 94.3,
      errorMarginMonths: 1.4,
      rulFormatted: profile.mlForecast.rulFormatted,
      statusLabel: profile.mlForecast.statusLabel,
      statusColor: profile.mlForecast.statusColor
    });

    // Notify listeners
    if (this.listeners.has('packChange')) {
      this.listeners.get('packChange').forEach(cb => cb(profile, this.state));
    }
  }
}

// Global singleton instance
window.AppState = new AppStateStore();
