// ============================================================
// POLLER.JS - Hardware Integration Polling Engine & Fault Manager
// ============================================================

class TelemetryPoller {
  constructor() {
    this.timer = null;
    this.intervalMs = 60000; // 60 seconds ESP32 heartbeat cycle
    this.missedConsecutive = 0;
    this.maxMissedBeforeOffline = 2; // Plan: 2 consecutive missed updates = Hardware Offline
    this.simulatedFault = false;
    this.isPolling = false;
    this.endpoint = '/api/telemetry'; // ESP32 HTTP route
    this.lastSuccessfulFetch = new Date();
  }

  init() {
    // Read state defaults
    const connState = window.AppState ? window.AppState.get('connection') : null;
    if (connState) {
      this.intervalMs = connState.pollingIntervalMs || 60000;
    }

    // Start polling automatically
    this.start();
  }

  start() {
    if (this.isPolling) return;
    this.isPolling = true;

    // Run first poll immediately
    this.poll();

    // Setup 60s interval
    this.timer = setInterval(() => {
      this.poll();
    }, this.intervalMs);

    console.log(`[Poller] Started background polling loop (${this.intervalMs / 1000}s interval)`);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isPolling = false;
    console.log('[Poller] Stopped background polling');
  }

  setIntervalSpeed(ms) {
    this.intervalMs = ms;
    if (this.isPolling) {
      this.stop();
      this.start();
    }
    if (window.AppState) {
      window.AppState.set('connection', { pollingIntervalMs: ms });
    }
  }

  async poll() {
    const conn = window.AppState ? window.AppState.get('connection') : { mode: 'mock' };

    // Check if fault simulation is active
    if (this.simulatedFault) {
      this.handleMissedUpdate('Simulated network timeout');
      return;
    }

    if (conn.mode === 'live') {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

        const response = await fetch(conn.liveEndpointUrl || this.endpoint, {
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP Error ${response.status}`);
        }

        const payload = await response.json();
        this.handleSuccessfulUpdate(payload);
      } catch (err) {
        console.warn('[Poller] Live fetch failed:', err.message);
        this.handleMissedUpdate(err.message);
      }
    } else {
      // MOCK MODE: Generate simulated hardware payload
      try {
        const currentTelemetry = window.AppState ? window.AppState.get('telemetry') : null;
        const packId = window.AppState ? window.AppState.get('activePackId') : 'pack-1';
        const payload = generateMockHardwarePayload(currentTelemetry, packId);
        this.handleSuccessfulUpdate(payload);
      } catch (err) {
        console.error('[Poller] Mock generation failed:', err);
        this.handleMissedUpdate('Mock generator failure');
      }
    }
  }

  handleSuccessfulUpdate(payload) {
    this.missedConsecutive = 0;
    this.lastSuccessfulFetch = new Date();

    if (window.AppState) {
      window.AppState.set('telemetry', {
        timestamp: payload.timestamp || new Date().toISOString(),
        pack_voltage: parseFloat(payload.pack_voltage),
        current_amps: parseFloat(payload.current_amps),
        temperature_c: parseFloat(payload.temperature_c),
        state_of_charge_percent: parseInt(payload.state_of_charge_percent, 10),
        state_of_health_percent: parseFloat(payload.state_of_health_percent || 94.2)
      });

      window.AppState.set('connection', {
        status: 'connected',
        lastSync: this.lastSuccessfulFetch,
        missedUpdates: 0
      });
    }

    this.updateOfflineOverlay(false);
  }

  handleMissedUpdate(reason) {
    this.missedConsecutive++;
    console.warn(`[Poller] Missed heartbeat #${this.missedConsecutive}: ${reason}`);

    if (window.AppState) {
      window.AppState.set('connection', {
        missedUpdates: this.missedConsecutive
      });
    }

    // Trigger overlay if 2 consecutive updates are missed
    if (this.missedConsecutive >= this.maxMissedBeforeOffline) {
      if (window.AppState) {
        window.AppState.set('connection', { status: 'disconnected' });
      }
      this.updateOfflineOverlay(true);
    }
  }

  updateOfflineOverlay(isOffline) {
    const overlay = document.getElementById('hardwareOfflineOverlay');
    const badge = document.getElementById('connStatus');
    const badgeText = document.getElementById('connStatusText');

    if (overlay) {
      if (isOffline) {
        overlay.classList.add('is-visible');
        overlay.setAttribute('aria-hidden', 'false');
      } else {
        overlay.classList.remove('is-visible');
        overlay.setAttribute('aria-hidden', 'true');
      }
    }

    if (badge && badgeText) {
      if (isOffline) {
        badge.setAttribute('data-state', 'disconnected');
        badgeText.textContent = 'Hardware Offline (Link Lost)';
      } else {
        const mode = window.AppState ? window.AppState.get('connection').mode : 'mock';
        badge.setAttribute('data-state', 'connected');
        badgeText.textContent = mode === 'mock' 
          ? 'Connected (Mock Engine: EV-PACK-001)' 
          : 'Connected (ESP32 Live Node)';
      }
    }
  }

  // Simulator helper: simulates physical cable disconnect
  simulateDisconnect() {
    this.simulatedFault = true;
    this.missedConsecutive = 2; // immediately reach threshold
    if (window.AppState) {
      window.AppState.set('connection', { status: 'disconnected', missedUpdates: 2 });
    }
    this.updateOfflineOverlay(true);
    console.log('[Poller] Simulated hardware disconnect triggered');
  }

  // Simulator helper: restores physical cable connection
  simulateReconnect() {
    this.simulatedFault = false;
    this.poll(); // trigger immediate poll to recover
    console.log('[Poller] Simulated hardware reconnection restored');
  }
}

// Global singleton instance
window.Poller = new TelemetryPoller();
