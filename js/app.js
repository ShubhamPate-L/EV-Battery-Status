// ============================================================
// APP.JS - Main Dashboard Application Controller
// Coordinates State, Navigation, 4-Pack Profiles, Logs, and Poller
// ============================================================

document.addEventListener('DOMContentLoaded', () => {

  // ---------- DOM ELEMENTS ----------
  // Header Elements
  const btnModeMock = document.getElementById('btnModeMock');
  const btnModeLive = document.getElementById('btnModeLive');
  const btnSimulateDropout = document.getElementById('btnSimulateDropout');
  const btnRestoreConnection = document.getElementById('btnRestoreConnection');
  const lastSyncTime = document.getElementById('lastSyncTime');
  const logoutBtn = document.getElementById('logoutBtn');
  const packSelect = document.getElementById('packSelect');
  const btnProfessorGuide = document.getElementById('btnProfessorGuide');

  // Walkthrough Modal Elements
  const walkthroughModal = document.getElementById('walkthroughModal');
  const btnCloseWalkthrough = document.getElementById('btnCloseWalkthrough');
  const demoPackBtns = document.querySelectorAll('.btn-demo-pack');

  // Navigation Tabs
  const navTabBtns = document.querySelectorAll('.nav-tab-btn');
  const tabPanels = document.querySelectorAll('.tab-content-panel');

  // Persistent Banner Elements
  const sohValueCard = document.getElementById('sohValueCard');
  const sohArcCard = document.getElementById('sohArcCard');
  const sohStatusBadge = document.getElementById('sohStatusBadge');
  const socValueCard = document.getElementById('socValueCard');
  const socArcCard = document.getElementById('socArcCard');
  const socRangeEstimate = document.getElementById('socRangeEstimate');
  const voltageDisplayCard = document.getElementById('voltageDisplayCard');
  const voltageThresholdDesc = document.getElementById('voltageThresholdDesc');
  const currentDisplayCard = document.getElementById('currentDisplayCard');
  const currentFlowIndicator = document.getElementById('currentFlowIndicator');
  const currentStatusText = document.getElementById('currentStatusText');
  const currentArrowSvg = document.getElementById('currentArrowSvg');
  const tempCardElement = document.getElementById('tempCardElement');
  const tempDisplayCard = document.getElementById('tempDisplayCard');
  const tempRangeDesc = document.getElementById('tempRangeDesc');

  // Logs Table Elements
  const timeTabs = document.querySelectorAll('.time-tab');
  const telemetryTableBody = document.getElementById('telemetryTableBody');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const paginationIndicator = document.getElementById('paginationIndicator');
  const searchLogsInput = document.getElementById('searchLogsInput');
  const exportDataBtn = document.getElementById('exportDataBtn');
  const tablePaginationControls = document.getElementById('tablePaginationControls');

  // Toast Element
  const appToast = document.getElementById('appToast');
  const toastMessage = document.getElementById('toastMessage');

  // ---------- LOCAL LOGS TABLE STATE ----------
  let currentLogRange = '1h';
  let currentLogPage = 1;
  const rowsPerPage = 15;
  let liveBuffer = [];
  let liveIntervalTimer = null;
  let simulatedFaultActive = false;

  const rangeCounts = {
    '15m': 15,
    '1h': 60,
    '6h': 360,
    '12h': 720
  };

  // Seed live buffer with pack-1
  if (typeof ALL_PACKS_LOGS !== 'undefined' && ALL_PACKS_LOGS['pack-1']) {
    liveBuffer = ALL_PACKS_LOGS['pack-1'].slice(-15);
  }

  // ============================================================
  // 1. SPA TAB NAVIGATION ROUTER (Phase 1.1.2)
  // ============================================================
  function switchTab(tabId) {
    if (!tabId) return;

    // Update active nav button
    navTabBtns.forEach(btn => {
      if (btn.dataset.tab === tabId) {
        btn.classList.add('is-active');
      } else {
        btn.classList.remove('is-active');
      }
    });

    // Update active panel
    tabPanels.forEach(panel => {
      if (panel.id === `tab-${tabId}`) {
        panel.classList.add('is-active');
      } else {
        panel.classList.remove('is-active');
      }
    });

    // Synchronize hash in URL
    window.location.hash = `#/${tabId}`;

    // Initialize or resize tab-specific charts
    if (tabId === 'diagnostics') {
      if (window.DiagnosticsController) {
        window.DiagnosticsController.init();
      }
    } else if (tabId === 'ml') {
      if (window.MLPredictionsController) {
        window.MLPredictionsController.init();
      }
    } else if (tabId === 'logs') {
      renderLogsTable();
    } else if (tabId === 'live-feed') {
      if (window.LiveFeedTabController) {
        window.LiveFeedTabController.init();
      }
    }

    if (window.AppState) {
      window.AppState.set('activeTab', tabId);
    }
  }

  // Bind tab click events
  navTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
    });
  });

  // Handle browser back/forward or deep linking
  function handleHashChange() {
    const hash = window.location.hash.replace('#/', '');
    if (['diagnostics', 'ml', 'logs', 'live-feed'].includes(hash)) {
      switchTab(hash);
    } else {
      switchTab('diagnostics');
    }
  }

  window.addEventListener('hashchange', handleHashChange);

  // ============================================================
  // 2. 4 SYNTHETIC BATTERY PACKS SWITCHER
  // ============================================================
  if (packSelect) {
    packSelect.addEventListener('change', (e) => {
      const selectedPack = e.target.value;
      if (window.AppState) {
        window.AppState.loadBatteryPack(selectedPack);
      }
    });
  }

  // Listen for pack changes from AppState
  if (window.AppState) {
    window.AppState.subscribe('packChange', (profile) => {
      if (!profile) return;

      // Sync select dropdown
      if (packSelect && packSelect.value !== profile.id) {
        packSelect.value = profile.id;
      }

      // Refresh live buffer for logs
      if (typeof ALL_PACKS_LOGS !== 'undefined' && ALL_PACKS_LOGS[profile.id]) {
        liveBuffer = ALL_PACKS_LOGS[profile.id].slice(-15);
      }

      currentLogPage = 1;
      renderLogsTable();

      showToast(`Switched to ${profile.label}`);
    });
  }

  // ============================================================
  // 3. PERSISTENT TELEMETRY BANNER (Phase 2 & Phase 5)
  // ============================================================
  function updateTelemetryBanner(data) {
    if (!data) return;

    // 1. State of Health (SoH)
    const soh = data.state_of_health_percent !== undefined ? data.state_of_health_percent : 95.2;
    if (sohValueCard) sohValueCard.textContent = Math.round(soh);
    if (sohArcCard) animateRadialGauge(sohArcCard, soh);
    if (sohStatusBadge) {
      if (soh >= 80) {
        sohStatusBadge.textContent = 'Optimal ↗';
        sohStatusBadge.className = 'metric-status optimal';
        sohStatusBadge.style.color = '#00FF88';
      } else if (soh >= 70) {
        sohStatusBadge.textContent = 'Caution Zone ↘';
        sohStatusBadge.className = 'metric-status';
        sohStatusBadge.style.color = '#FFB454';
      } else {
        sohStatusBadge.textContent = 'Retirement Stage';
        sohStatusBadge.className = 'metric-status';
        sohStatusBadge.style.color = '#FF5C5C';
      }
    }

    // 2. State of Charge (SoC)
    const soc = Math.round(data.state_of_charge_percent !== undefined ? data.state_of_charge_percent : 68);
    if (socValueCard) socValueCard.textContent = soc;
    if (socArcCard) animateRadialGauge(socArcCard, soc);
    if (socRangeEstimate) {
      const estKm = Math.round((soc / 100) * 210);
      socRangeEstimate.textContent = `~${estKm} km est. range`;
    }

    // 3. Battery Voltage & Critical Threshold Alert (Phase 2.2)
    const voltage = parseFloat(data.pack_voltage || 24.4);
    if (voltageDisplayCard) {
      voltageDisplayCard.textContent = voltage.toFixed(1);

      // Warning thresholds: <22.0V or >26.0V
      if (voltage < 22.0 || voltage > 26.0) {
        voltageDisplayCard.classList.add('voltage-alert');
        if (voltageThresholdDesc) {
          voltageThresholdDesc.textContent = 'CRITICAL: Voltage Threshold Exceeded!';
          voltageThresholdDesc.style.color = '#FF5C5C';
        }
      } else {
        voltageDisplayCard.classList.remove('voltage-alert');
        if (voltageThresholdDesc) {
          voltageThresholdDesc.textContent = 'Nominal Range (21.0V - 25.2V)';
          voltageThresholdDesc.style.color = '';
        }
      }
    }

    // 4. Current Flow & Directional Arrow (Phase 2.3)
    const current = parseFloat(data.current_amps || -85);
    if (currentDisplayCard) {
      currentDisplayCard.textContent = Math.round(Math.abs(current));
    }

    if (currentFlowIndicator && currentArrowSvg && currentStatusText) {
      if (current >= 0) {
        // Charging: arrow points UP, green accent
        currentFlowIndicator.className = 'current-flow-indicator flow-charging';
        currentArrowSvg.innerHTML = '<path d="M12 4L4 12h5v8h6v-8h5z" />';
        currentStatusText.textContent = 'Charging (Active) ↗';
      } else {
        // Discharging: arrow points DOWN, amber/gray accent
        currentFlowIndicator.className = 'current-flow-indicator flow-discharging';
        currentArrowSvg.innerHTML = '<path d="M12 20L4 12h5V4h6v8h5z" />';
        currentStatusText.textContent = 'Discharging (Active) ↘';
      }
    }

    // 5. Battery Temperature & Flashing Warning Icon (Phase 2.4)
    const temp = parseFloat(data.temperature_c || 24.5);
    if (tempDisplayCard) {
      tempDisplayCard.textContent = Math.round(temp);

      if (temp >= 40) {
        // Critical: Red + Flashing Alert Icon
        tempDisplayCard.style.color = '#FF5C5C';
        if (tempCardElement) tempCardElement.classList.add('thermal-warning-active');
        if (tempRangeDesc) {
          tempRangeDesc.textContent = 'OVERHEAT WARNING (>40°C)';
          tempRangeDesc.style.color = '#FF5C5C';
        }
      } else if (temp >= 35) {
        // Warning: Amber
        tempDisplayCard.style.color = '#FFB454';
        if (tempCardElement) tempCardElement.classList.remove('thermal-warning-active');
        if (tempRangeDesc) {
          tempRangeDesc.textContent = 'Elevated Thermal Range';
          tempRangeDesc.style.color = '#FFB454';
        }
      } else {
        // Normal: Green
        tempDisplayCard.style.color = '#00FF88';
        if (tempCardElement) tempCardElement.classList.remove('thermal-warning-active');
        if (tempRangeDesc) {
          tempRangeDesc.textContent = 'Normal Range (20°C - 40°C)';
          tempRangeDesc.style.color = '#00FF88';
        }
      }
    }

    // Update Last-Sync Indicator
    if (lastSyncTime) {
      const now = new Date();
      lastSyncTime.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
  }

  // Radial Gauge SVG Stroke Animator
  function animateRadialGauge(arcElement, value) {
    if (!arcElement) return;
    const MAX_SWEEP = 219.91; // 70% of circumference
    const length = MAX_SWEEP * (Math.max(0, Math.min(100, value)) / 100);
    arcElement.style.strokeDasharray = `${length} 999`;

    // Dynamic continuous color
    const hue = Math.max(0, Math.min(100, value)) * 1.2;
    arcElement.style.stroke = `hsl(${hue}, 80%, 50%)`;
  }

  // ============================================================
  // 4. HARDWARE LINK CONTROLS & POLLING (Phase 5)
  // ============================================================
  if (btnModeMock && btnModeLive) {
    btnModeMock.addEventListener('click', () => {
      btnModeMock.classList.add('active');
      btnModeLive.classList.remove('active');
      if (window.AppState) {
        window.AppState.set('connection', { mode: 'mock' });
      }
      showToast('Switched to Internal Mock Hardware Engine');
    });

    btnModeLive.addEventListener('click', () => {
      btnModeLive.classList.add('active');
      btnModeMock.classList.remove('active');
      if (window.AppState) {
        window.AppState.set('connection', { mode: 'live' });
      }
      showToast('Attempting Live ESP32 Hardware Endpoint Polling');
    });
  }

  // Simulate Disconnect / Dropout Test Button
  if (btnSimulateDropout) {
    btnSimulateDropout.addEventListener('click', () => {
      if (!simulatedFaultActive) {
        simulatedFaultActive = true;
        btnSimulateDropout.innerHTML = '<span>⚡</span> Reconnect Link';
        btnSimulateDropout.style.borderColor = 'var(--green)';
        btnSimulateDropout.style.color = 'var(--green)';
        if (window.Poller) window.Poller.simulateDisconnect();
        showToast('⚠️ Hardware Link Lost (2 missed heartbeats)', false);
      } else {
        simulatedFaultActive = false;
        btnSimulateDropout.innerHTML = '<span>⚡</span> Simulate Disconnect';
        btnSimulateDropout.style.borderColor = '';
        btnSimulateDropout.style.color = '';
        if (window.Poller) window.Poller.simulateReconnect();
        showToast('✓ Hardware Link Restored', true);
      }
    });
  }

  // Restore Connection Button on Overlay
  if (btnRestoreConnection) {
    btnRestoreConnection.addEventListener('click', () => {
      simulatedFaultActive = false;
      if (btnSimulateDropout) {
        btnSimulateDropout.innerHTML = '<span>⚡</span> Simulate Disconnect';
        btnSimulateDropout.style.borderColor = '';
        btnSimulateDropout.style.color = '';
      }
      if (window.Poller) window.Poller.simulateReconnect();
      showToast('✓ Hardware Link Restored', true);
    });
  }

  // ============================================================
  // 5. PROFESSOR PRESENTATION & VIVA WALKTHROUGH MODAL
  // ============================================================
  if (btnProfessorGuide && walkthroughModal) {
    btnProfessorGuide.addEventListener('click', () => {
      walkthroughModal.classList.add('is-open');
      walkthroughModal.setAttribute('aria-hidden', 'false');
    });
  }

  if (btnCloseWalkthrough && walkthroughModal) {
    btnCloseWalkthrough.addEventListener('click', () => {
      walkthroughModal.classList.remove('is-open');
      walkthroughModal.setAttribute('aria-hidden', 'true');
    });
  }

  // Close modal when clicking on the blurred backdrop
  if (walkthroughModal) {
    walkthroughModal.addEventListener('click', (e) => {
      if (e.target === walkthroughModal) {
        walkthroughModal.classList.remove('is-open');
        walkthroughModal.setAttribute('aria-hidden', 'true');
      }
    });
  }

  // Walkthrough quick demo pack switch buttons
  demoPackBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const packId = btn.dataset.pack;
      if (window.AppState) {
        window.AppState.loadBatteryPack(packId);
      }
      // Provide instant feedback
      demoPackBtns.forEach(b => b.style.borderColor = '');
      btn.style.borderColor = 'var(--cyan)';
      showToast(`Loaded ${btn.querySelector('strong').textContent} for demonstration!`);
    });
  });

  // ============================================================
  // 6. TELEMETRY LOGS TABLE & CSV DATA EXPORT (Phase 6)
  // ============================================================
  function getRawLogData() {
    const packId = window.AppState ? window.AppState.get('activePackId') : 'pack-1';
    const packLogs = (typeof ALL_PACKS_LOGS !== 'undefined' && ALL_PACKS_LOGS[packId])
      ? ALL_PACKS_LOGS[packId]
      : (typeof TELEMETRY_DATA !== 'undefined' ? TELEMETRY_DATA : []);

    if (currentLogRange === 'live') return liveBuffer;
    const count = rangeCounts[currentLogRange] || 60;
    return packLogs.slice(-count);
  }

  function getFilteredLogData() {
    const raw = getRawLogData();
    const query = (searchLogsInput ? searchLogsInput.value : '').trim().toLowerCase();
    if (!query) return raw;

    return raw.filter(row => {
      return (
        (row.date && row.date.toLowerCase().includes(query)) ||
        (row.time && row.time.toLowerCase().includes(query)) ||
        (row.soc && row.soc.toString().includes(query)) ||
        (row.voltage && row.voltage.toString().includes(query)) ||
        (row.temp && row.temp.toString().includes(query))
      );
    });
  }

  function renderLogsTable() {
    if (!telemetryTableBody) return;

    if (currentLogRange === 'live') {
      if (tablePaginationControls) tablePaginationControls.style.display = 'none';
      renderLiveStreamRows();
      return;
    }

    if (tablePaginationControls) tablePaginationControls.style.display = 'flex';

    const data = getFilteredLogData();
    const totalPages = Math.max(1, Math.ceil(data.length / rowsPerPage));
    if (currentLogPage > totalPages) currentLogPage = totalPages;

    const start = (currentLogPage - 1) * rowsPerPage;
    const pageRows = data.slice(start, start + rowsPerPage);

    telemetryTableBody.innerHTML = '';

    pageRows.forEach(row => {
      const tr = document.createElement('tr');
      const tempStyle = row.temp > 40 ? 'color: #FF5C5C; font-weight:700;' : '';
      tr.innerHTML = `
        <td>${row.date || 'Nov 18, 2026'}</td>
        <td>${row.time || '--:--'}</td>
        <td>${parseFloat(row.soc).toFixed(1)}%</td>
        <td>${parseFloat(row.voltage).toFixed(2)}V</td>
        <td>${Math.round(Math.abs(row.current))}mA</td>
        <td class="temp-cell" style="${tempStyle}">${parseFloat(row.temp).toFixed(1)}°C</td>
      `;
      telemetryTableBody.appendChild(tr);
    });

    if (paginationIndicator) {
      paginationIndicator.textContent = `${currentLogPage} of ${totalPages} (${data.length} total)`;
    }
  }

  function renderLiveStreamRows() {
    telemetryTableBody.innerHTML = '';
    [...liveBuffer].reverse().forEach(row => {
      const tr = document.createElement('tr');
      const tempStyle = row.temp > 40 ? 'color: #FF5C5C; font-weight:700;' : '';
      tr.innerHTML = `
        <td>${row.date || 'Nov 18, 2026'}</td>
        <td>${row.time || '--:--'}</td>
        <td>${parseFloat(row.soc).toFixed(1)}%</td>
        <td>${parseFloat(row.voltage).toFixed(2)}V</td>
        <td>${Math.round(Math.abs(row.current))}mA</td>
        <td class="temp-cell" style="${tempStyle}">${parseFloat(row.temp).toFixed(1)}°C</td>
      `;
      telemetryTableBody.appendChild(tr);
    });
  }

  function startLiveStreamingMode() {
    stopLiveStreamingMode();
    renderLogsTable();
    liveIntervalTimer = setInterval(() => {
      const packId = window.AppState ? window.AppState.get('activePackId') : 'pack-1';
      if (typeof generateNextLivePointForPack === 'function') {
        const pt = generateNextLivePointForPack(packId);
        liveBuffer.push(pt);
        if (liveBuffer.length > 20) liveBuffer.shift();
        renderLiveStreamRows();
      }
    }, 5000);
  }

  function stopLiveStreamingMode() {
    if (liveIntervalTimer) {
      clearInterval(liveIntervalTimer);
      liveIntervalTimer = null;
    }
  }

  // Logs Time Tabs
  timeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      timeTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      currentLogRange = tab.dataset.range;
      currentLogPage = 1;

      if (currentLogRange === 'live') {
        startLiveStreamingMode();
      } else {
        stopLiveStreamingMode();
        renderLogsTable();
      }
    });
  });

  // Table Search Filter
  if (searchLogsInput) {
    searchLogsInput.addEventListener('input', () => {
      currentLogPage = 1;
      renderLogsTable();
    });
  }

  // Pagination Navigation
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (currentLogPage > 1) {
        currentLogPage--;
        renderLogsTable();
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      const data = getFilteredLogData();
      const totalPages = Math.ceil(data.length / rowsPerPage);
      if (currentLogPage < totalPages) {
        currentLogPage++;
        renderLogsTable();
      }
    });
  }

  // CSV Data Export Button
  if (exportDataBtn) {
    exportDataBtn.addEventListener('click', () => {
      const data = getFilteredLogData();
      const packId = window.AppState ? window.AppState.get('activePackId') : 'pack-1';
      if (!data || data.length === 0) {
        showToast('No telemetry logs to export', false);
        return;
      }

      // Generate CSV string
      const headers = ['Date', 'Time', 'State_of_Charge_pct', 'Pack_Voltage_V', 'Current_mA', 'Temperature_C'];
      const rows = data.map(r => [
        `"${r.date || ''}"`,
        `"${r.time || ''}"`,
        parseFloat(r.soc).toFixed(1),
        parseFloat(r.voltage).toFixed(2),
        Math.round(Math.abs(r.current)),
        parseFloat(r.temp).toFixed(1)
      ]);

      const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `VoltSense_Telemetry_${packId.toUpperCase()}_Export_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showToast(`Exported ${data.length} records for ${packId.toUpperCase()} to CSV`);
    });
  }

  // ============================================================
  // 7. TOAST NOTIFICATION UTILITY
  // ============================================================
  function showToast(message, isSuccess = true) {
    if (!appToast || !toastMessage) return;
    toastMessage.textContent = message;
    const icon = document.getElementById('toastIcon');
    if (icon) icon.textContent = isSuccess ? '✓' : '⚠️';
    appToast.classList.add('is-visible');

    setTimeout(() => {
      appToast.classList.remove('is-visible');
    }, 3200);
  }

  window.showToast = showToast;

  // ============================================================
  // 8. INITIALIZATION SEQUENCE
  // ============================================================
  // Subscribe persistent banner to state
  if (window.AppState) {
    window.AppState.subscribe('telemetry', (telemetry) => {
      updateTelemetryBanner(telemetry);
    });
  }

  // Initialize Poller (Phase 5)
  if (window.Poller) {
    window.Poller.init();
  }

  // Initialize first view from hash or default to diagnostics
  handleHashChange();

  // Load default pack-1 initially
  if (window.AppState) {
    window.AppState.loadBatteryPack('pack-1');
  }

  // Authentication logout handler
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      sessionStorage.removeItem('evAuthenticated');
      window.location.href = 'login.html';
    });
  }

  console.log('✓ VoltSense Dashboard initialized with 4-Pack Synthetic Profiles & NASA PCoE ML Models');
});
