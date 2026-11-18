// ============================================================
// LIVEFEEDTAB.JS - Controller for Live ESP32 Serial Feed & 16x2 LCD
// Handles Live Temperature, Current, and Voltage Readings
// ============================================================

const LiveFeedTabController = {
  initialized: false,
  chartInstance: null,
  historyBuffer: [],
  maxPoints: 30, // 30-second rolling window at 1s intervals
  terminalLineLimit: 120,

  init() {
    if (this.initialized) return;

    // Grab UI elements
    this.btnConnect = document.getElementById('btnSerialConnect');
    this.btnDisconnect = document.getElementById('btnSerialDisconnect');
    this.btnSimulate = document.getElementById('btnSerialSimulate');
    this.baudSelect = document.getElementById('serialBaudSelect');
    this.statusBadge = document.getElementById('serialStatusBadge');
    this.statusDot = document.getElementById('serialStatusDot');
    this.statusText = document.getElementById('serialStatusText');

    // 16x2 LCD Display elements
    this.lcdLine1 = document.getElementById('lcdLine1');
    this.lcdLine2 = document.getElementById('lcdLine2');

    // Live Sensor Metrics elements
    this.liveVoltDisplay = document.getElementById('liveVoltDisplay');
    this.liveVoltStatus = document.getElementById('liveVoltStatus');
    this.liveTempDisplay = document.getElementById('liveTempDisplay');
    this.liveCurrDisplay = document.getElementById('liveCurrDisplay');
    this.livePinVoltDisplay = document.getElementById('livePinVoltDisplay');
    this.liveSensorVoltDisplay = document.getElementById('liveSensorVoltDisplay');
    this.liveZeroOffsetDisplay = document.getElementById('liveZeroOffsetDisplay');
    this.livePowerDisplay = document.getElementById('livePowerDisplay');
    this.liveCurrentDirection = document.getElementById('liveCurrentDirection');

    // Terminal elements
    this.serialTerminal = document.getElementById('serialTerminal');
    this.btnClearTerminal = document.getElementById('btnClearTerminal');
    this.terminalLineCount = document.getElementById('terminalLineCount');
    this.serialBytesCount = document.getElementById('serialBytesCount');
    this.serialPacketsCount = document.getElementById('serialPacketsCount');

    // CSV Logger Elements
    this.btnToggleCsvLog = document.getElementById('btnToggleCsvLog');
    this.btnExportLiveCsv = document.getElementById('btnExportLiveCsv');
    this.btnClearCsvLog = document.getElementById('btnClearCsvLog');
    this.csvRecordingDot = document.getElementById('csvRecordingDot');
    this.csvStatusText = document.getElementById('csvStatusText');
    this.csvLogCountBadge = document.getElementById('csvLogCountBadge');
    this.csvLogSizeBadge = document.getElementById('csvLogSizeBadge');

    this.isCsvLogging = true;
    this.csvBuffer = [];
    this.loadPersistedCsvBuffer();

    this.bindEvents();
    this.initChart();
    this.initialized = true;

    // Check Web Serial support
    if (window.WebSerialService && !window.WebSerialService.isSupported()) {
      if (this.statusText) {
        this.statusText.textContent = 'Web Serial API unsupported in this browser (Use Chrome or Edge)';
      }
      if (this.btnConnect) {
        this.btnConnect.disabled = true;
        this.btnConnect.title = 'Web Serial requires Google Chrome or Microsoft Edge';
      }
    }

    // Auto-start continuous 1-second bench stream if hardware serial is disconnected,
    // so live feed immediately changes every 1 second continuously upon opening
    if (window.WebSerialService && !window.WebSerialService.isConnected && !window.WebSerialService.isSimulating) {
      window.WebSerialService.startSimulation();
      if (this.btnSimulate) {
        this.btnSimulate.innerHTML = '<span>⏹</span> Pause Bench Simulator';
        this.btnSimulate.classList.add('is-active');
      }
    }

    console.log('✓ ESP32 Live Feed Tab & 16x2 LCD Controller Initialized');
  },

  bindEvents() {
    // Connect Button
    if (this.btnConnect) {
      this.btnConnect.addEventListener('click', async () => {
        const baud = this.baudSelect ? this.baudSelect.value : 115200;
        try {
          await window.WebSerialService.connect(baud);
        } catch (err) {
          // Handled via status listener
        }
      });
    }

    // Disconnect Button
    if (this.btnDisconnect) {
      this.btnDisconnect.addEventListener('click', async () => {
        await window.WebSerialService.disconnect();
      });
    }

    // Simulator Toggle Button
    if (this.btnSimulate) {
      this.btnSimulate.addEventListener('click', () => {
        if (window.WebSerialService.isSimulating) {
          window.WebSerialService.stopSimulation();
          this.btnSimulate.innerHTML = '<span>▶</span> Run 1s Bench Simulator';
          this.btnSimulate.classList.remove('is-active');
        } else {
          window.WebSerialService.startSimulation();
          this.btnSimulate.innerHTML = '<span>⏹</span> Pause Bench Simulator';
          this.btnSimulate.classList.add('is-active');
        }
      });
    }

    // Clear Terminal Button
    if (this.btnClearTerminal) {
      this.btnClearTerminal.addEventListener('click', () => {
        if (this.serialTerminal) {
          this.serialTerminal.innerHTML = '<div class="terminal-msg info">// Terminal cleared. Waiting for serial data...</div>';
        }
        if (this.terminalLineCount) this.terminalLineCount.textContent = '0 lines';
      });
    }

    // CSV Logging Toggle Button
    if (this.btnToggleCsvLog) {
      this.btnToggleCsvLog.addEventListener('click', () => {
        this.isCsvLogging = !this.isCsvLogging;
        if (this.isCsvLogging) {
          this.btnToggleCsvLog.innerHTML = '<span>⏹</span> Pause Logging';
          if (this.csvRecordingDot) this.csvRecordingDot.className = 'csv-recording-dot is-recording';
          if (this.csvStatusText) this.csvStatusText.textContent = 'Auto-logging active (buffered locally in browser)';
        } else {
          this.btnToggleCsvLog.innerHTML = '<span>▶</span> Resume Logging';
          if (this.csvRecordingDot) this.csvRecordingDot.className = 'csv-recording-dot';
          if (this.csvStatusText) this.csvStatusText.textContent = 'Logging paused (click Resume to record)';
        }
      });
    }

    // CSV Export to Disk Button
    if (this.btnExportLiveCsv) {
      this.btnExportLiveCsv.addEventListener('click', () => {
        this.exportCsvFile();
      });
    }

    // CSV Clear Buffer Button
    if (this.btnClearCsvLog) {
      this.btnClearCsvLog.addEventListener('click', () => {
        if (this.csvBuffer.length === 0) {
          if (window.showToast) window.showToast('CSV buffer is already empty', false);
          return;
        }
        if (confirm(`Clear all ${this.csvBuffer.length} recorded CSV samples from memory?`)) {
          this.clearCsvBuffer();
        }
      });
    }

    // Web Serial Service Event Listeners
    if (window.WebSerialService) {
      // 1. Data Packet Received
      window.WebSerialService.on('data', (data) => {
        this.handleLivePacket(data);
      });

      // 2. Raw Serial Line Received
      window.WebSerialService.on('line', (line) => {
        this.appendTerminalLine(line);
      });

      // 3. Status Changed
      window.WebSerialService.on('status', (status) => {
        this.handleStatusChange(status);
      });
    }
  },

  initChart() {
    const canvas = document.getElementById('liveFeedChart');
    if (!canvas) return;

    if (this.chartInstance) {
      this.chartInstance.destroy();
    }

    const ctx = canvas.getContext('2d');

    this.chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'ACS712 Current (A)',
            data: [],
            borderColor: '#00D4FF',
            backgroundColor: 'rgba(0, 212, 255, 0.08)',
            borderWidth: 2,
            pointRadius: 2,
            tension: 0.25,
            fill: true,
            yAxisID: 'yCurrent'
          },
          {
            label: 'DS18B20 Temp (°C)',
            data: [],
            borderColor: '#00FF88',
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderDash: [4, 3],
            pointRadius: 2,
            tension: 0.2,
            yAxisID: 'yTemp'
          },
          {
            label: 'Battery Pack Voltage (V)',
            data: [],
            borderColor: '#FFB454',
            backgroundColor: 'transparent',
            borderWidth: 2,
            pointRadius: 1,
            tension: 0.2,
            yAxisID: 'yVolt'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 250 },
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: {
            grid: { color: 'rgba(61, 77, 98, 0.3)' },
            ticks: { color: '#B0B8C1', font: { family: 'JetBrains Mono', size: 10 }, maxTicksLimit: 8 }
          },
          yCurrent: {
            type: 'linear',
            position: 'left',
            min: 0,
            max: 5,
            grid: { color: 'rgba(61, 77, 98, 0.3)' },
            ticks: { color: '#00D4FF', font: { family: 'JetBrains Mono', size: 11 } },
            title: { display: true, text: 'Current (A)', color: '#00D4FF' }
          },
          yTemp: {
            type: 'linear',
            position: 'right',
            min: 15,
            max: 55,
            grid: { drawOnChartArea: false },
            ticks: { color: '#00FF88', font: { family: 'JetBrains Mono', size: 11 } },
            title: { display: true, text: 'Temp (°C)', color: '#00FF88' }
          },
          yVolt: {
            type: 'linear',
            position: 'right',
            min: 18,
            max: 30,
            grid: { drawOnChartArea: false },
            ticks: { color: '#FFB454', font: { family: 'JetBrains Mono', size: 11 } },
            title: { display: true, text: 'Voltage (V)', color: '#FFB454' }
          }
        },
        plugins: {
          legend: {
            display: true,
            labels: { color: '#B0B8C1', boxWidth: 12, font: { size: 11 } }
          },
          tooltip: {
            backgroundColor: 'rgba(26, 35, 50, 0.95)',
            borderColor: '#00D4FF',
            borderWidth: 1,
            titleColor: '#fff',
            bodyColor: '#B0B8C1'
          }
        }
      }
    });
  },

  /**
   * Processes a live decoded packet from the ESP32
   * { temperature: 25.5, current: 1.25, voltage: 24.2, timestamp: Date }
   */
  handleLivePacket(data) {
    const tempC = data.temperature;
    const currentA = data.current;
    const voltageV = data.voltage !== undefined ? data.voltage : 24.2;
    const timeLabel = data.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // 1. UPDATE 16x2 PHYSICAL LCD DISPLAY EMULATOR
    // Matches the exact format printed in your Arduino code:
    // Line 1: Temp: XX.X°C
    // Line 2: Curr: X.XXA
    if (this.lcdLine1) {
      const line1Str = `Temp: ${tempC.toFixed(1)}\u00DFC  `;
      this.lcdLine1.textContent = line1Str.padEnd(16, ' ');
    }
    if (this.lcdLine2) {
      const line2Str = `Curr: ${currentA.toFixed(2)}A  `;
      this.lcdLine2.textContent = line2Str.padEnd(16, ' ');
    }

    // 2. UPDATE SENSOR METRICS CARDS
    // Voltage Card
    if (this.liveVoltDisplay) {
      this.liveVoltDisplay.textContent = voltageV.toFixed(1);
    }
    if (this.liveVoltStatus) {
      if (voltageV < 21.0) {
        this.liveVoltStatus.textContent = 'LOW VOLTAGE DRAIN';
        this.liveVoltStatus.style.color = '#FF5C5C';
      } else if (voltageV > 25.5) {
        this.liveVoltStatus.textContent = 'HIGH CHARGE VOLTAGE';
        this.liveVoltStatus.style.color = '#FFB454';
      } else {
        this.liveVoltStatus.textContent = 'Normal Nominal Window (21.0V - 25.2V)';
        this.liveVoltStatus.style.color = '#00FF88';
      }
    }

    // Temperature Card
    if (this.liveTempDisplay) {
      this.liveTempDisplay.textContent = tempC.toFixed(1);
      this.liveTempDisplay.style.color = tempC > 40 ? '#FF5C5C' : '#00FF88';
    }

    // Current Card
    if (this.liveCurrDisplay) {
      this.liveCurrDisplay.textContent = Math.abs(currentA).toFixed(2);
    }

    // ACS712 & 1k:2.2k Voltage Divider Math (using your measured 0.81V zero-point!)
    // Formula in your sketch:
    // float currentAmps = (sensorVoltage - 0.81) / 0.100;
    // Reverse math to obtain sensor voltage:
    const sensorVoltage = 0.81 + (currentA * 0.100);
    // Pin voltage before the 1.4545 divider:
    const pinVoltage = sensorVoltage / 1.4545;
    // Power: P = V * I
    const powerW = Math.abs(voltageV * currentA);

    if (this.liveSensorVoltDisplay) {
      this.liveSensorVoltDisplay.textContent = `${sensorVoltage.toFixed(3)} V`;
    }
    if (this.livePinVoltDisplay) {
      this.livePinVoltDisplay.textContent = `${pinVoltage.toFixed(3)} V`;
    }
    if (this.liveZeroOffsetDisplay) {
      this.liveZeroOffsetDisplay.textContent = '0.810 V (Calibrated)';
    }
    if (this.livePowerDisplay) {
      this.livePowerDisplay.textContent = `${powerW.toFixed(1)} W`;
    }
    if (this.liveCurrentDirection) {
      if (currentA > 0.05) {
        this.liveCurrentDirection.textContent = 'Charging (Inflow ↗)';
        this.liveCurrentDirection.style.color = '#00FF88';
      } else if (currentA < -0.05) {
        this.liveCurrentDirection.textContent = 'Discharging (Load ↘)';
        this.liveCurrentDirection.style.color = '#FFB454';
      } else {
        this.liveCurrentDirection.textContent = 'Standby / Quiescent';
        this.liveCurrentDirection.style.color = '#B0B8C1';
      }
    }

    // 3. UPDATE ROLLING OSCILLOSCOPE CHART (Current, Temp, Voltage)
    if (this.chartInstance) {
      this.historyBuffer.push({
        time: timeLabel,
        current: currentA,
        temp: tempC,
        volt: voltageV
      });

      if (this.historyBuffer.length > this.maxPoints) {
        this.historyBuffer.shift();
      }

      this.chartInstance.data.labels = this.historyBuffer.map(h => h.time);
      this.chartInstance.data.datasets[0].data = this.historyBuffer.map(h => h.current);
      this.chartInstance.data.datasets[1].data = this.historyBuffer.map(h => h.temp);
      this.chartInstance.data.datasets[2].data = this.historyBuffer.map(h => h.volt);
      this.chartInstance.update();
    }

    // 4. UPDATE TRAFFIC STATS
    if (this.serialPacketsCount) {
      this.serialPacketsCount.textContent = `${window.WebSerialService.stats.packetsParsed} packets`;
    }
    if (this.serialBytesCount) {
      const kb = (window.WebSerialService.stats.bytesReceived / 1024).toFixed(1);
      this.serialBytesCount.textContent = `${kb} KB`;
    }

    // 5. SYNCHRONIZE WITH PERSISTENT GLOBAL TELEMETRY BANNER
    if (window.AppState) {
      const currentTelemetry = window.AppState.get('telemetry') || {};
      window.AppState.set('telemetry', {
        ...currentTelemetry,
        temperature_c: tempC,
        current_amps: -(currentA * 1000), // convert Amps to mA for top banner
        pack_voltage: voltageV
      });
    }

    // 6. RECORD LIVE PACKET TO CSV BUFFER
    this.recordPacketToCsv({
      timestamp_iso: data.timestamp ? data.timestamp.toISOString() : new Date().toISOString(),
      date: data.timestamp ? data.timestamp.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '',
      time: data.timestamp ? data.timestamp.toLocaleTimeString('en-US', { hour12: false }) : '',
      temperature: tempC,
      current: currentA,
      voltage: voltageV,
      power: powerW,
      pin_voltage: pinVoltage,
      sensor_voltage: sensorVoltage,
      zero_offset: 0.810,
      source: (window.WebSerialService && window.WebSerialService.isSimulating) ? 'BENCH_SIMULATOR' : 'ESP32_HARDWARE'
    });
  },

  /**
   * Loads existing CSV buffer from browser localStorage
   */
  loadPersistedCsvBuffer() {
    try {
      const stored = localStorage.getItem('voltsense_live_telemetry_csv');
      if (stored) {
        this.csvBuffer = JSON.parse(stored);
        this.updateCsvLogStats();
      }
    } catch (e) {
      console.warn('[CSV Logger] Could not load localStorage buffer:', e);
      this.csvBuffer = [];
    }
  },

  /**
   * Persists CSV buffer into localStorage (capped at last 2500 entries)
   */
  persistCsvBuffer() {
    try {
      const toStore = this.csvBuffer.slice(-2500);
      localStorage.setItem('voltsense_live_telemetry_csv', JSON.stringify(toStore));
    } catch (e) {
      console.warn('[CSV Logger] Local storage quota limit:', e);
    }
  },

  /**
   * Updates CSV row count and estimated file size badges
   */
  updateCsvLogStats() {
    const count = this.csvBuffer ? this.csvBuffer.length : 0;
    if (this.csvLogCountBadge) {
      this.csvLogCountBadge.textContent = `${count} rows logged`;
    }
    if (this.csvLogSizeBadge) {
      // Average ~90 bytes per CSV formatted row
      const kb = ((count * 90) / 1024).toFixed(1);
      this.csvLogSizeBadge.textContent = `${kb} KB`;
    }
  },

  /**
   * Appends incoming live packet to in-memory buffer
   */
  recordPacketToCsv(packet) {
    if (!this.isCsvLogging) return;

    this.csvBuffer.push(packet);
    this.updateCsvLogStats();

    // Persist to local disk cache every 5 samples
    if (this.csvBuffer.length % 5 === 0) {
      this.persistCsvBuffer();
    }
  },

  /**
   * Generates formatted CSV content and triggers local file download
   */
  exportCsvFile() {
    if (!this.csvBuffer || this.csvBuffer.length === 0) {
      if (window.showToast) window.showToast('No telemetry data recorded to export', false);
      return;
    }

    const headers = [
      'Timestamp_ISO',
      'Date',
      'Time',
      'DS18B20_Temperature_C',
      'ACS712_Current_A',
      'Battery_Voltage_V',
      'Pack_Power_W',
      'Pin_Voltage_V',
      'Sensor_Voltage_V',
      'Calibrated_Zero_Offset_V',
      'Data_Source'
    ];

    const rows = this.csvBuffer.map(item => [
      `"${item.timestamp_iso || ''}"`,
      `"${item.date || ''}"`,
      `"${item.time || ''}"`,
      parseFloat(item.temperature).toFixed(1),
      parseFloat(item.current).toFixed(2),
      parseFloat(item.voltage).toFixed(2),
      parseFloat(item.power).toFixed(1),
      parseFloat(item.pin_voltage).toFixed(3),
      parseFloat(item.sensor_voltage).toFixed(3),
      parseFloat(item.zero_offset).toFixed(3),
      `"${item.source || 'ESP32'}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    const now = new Date();
    const timestampStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `VoltSense_ESP32_Live_Telemetry_${timestampStr}.csv`;

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    if (window.showToast) {
      window.showToast(`Saved ${this.csvBuffer.length} records to ${filename}`);
    }
  },

  /**
   * Clears buffer and removes from localStorage
   */
  clearCsvBuffer() {
    this.csvBuffer = [];
    localStorage.removeItem('voltsense_live_telemetry_csv');
    this.updateCsvLogStats();
    if (window.showToast) {
      window.showToast('Local CSV telemetry buffer cleared');
    }
  },

  /**
   * Appends incoming raw serial line to the terminal window
   */
  appendTerminalLine(rawLine) {
    if (!this.serialTerminal) return;

    const lineEl = document.createElement('div');
    lineEl.className = 'terminal-line';
    const now = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

    lineEl.innerHTML = `<span class="term-time">[${now}]</span> <span class="term-data">${this.escapeHtml(rawLine)}</span>`;
    this.serialTerminal.appendChild(lineEl);

    // Limit buffer lines
    while (this.serialTerminal.children.length > this.terminalLineLimit) {
      this.serialTerminal.removeChild(this.serialTerminal.children[0]);
    }

    // Autoscroll to bottom
    this.serialTerminal.scrollTop = this.serialTerminal.scrollHeight;

    if (this.terminalLineCount) {
      this.terminalLineCount.textContent = `${this.serialTerminal.children.length} lines`;
    }
  },

  handleStatusChange(status) {
    if (!this.statusText) return;

    if (status.state === 'connected') {
      this.statusText.textContent = status.message || 'Connected (115200 baud)';
      if (this.statusDot) {
        this.statusDot.className = 'conn-dot dot-connected';
      }
      if (this.btnConnect) this.btnConnect.style.display = 'none';
      if (this.btnDisconnect) this.btnDisconnect.style.display = 'inline-flex';
    } else if (status.state === 'simulating') {
      this.statusText.textContent = status.message;
      if (this.statusDot) {
        this.statusDot.className = 'conn-dot dot-simulating';
      }
      if (this.btnSimulate) {
        this.btnSimulate.innerHTML = '<span>⏹</span> Pause Bench Simulator';
        this.btnSimulate.classList.add('is-active');
      }
    } else if (status.state === 'disconnected') {
      this.statusText.textContent = status.message || 'Disconnected (Ready to Connect)';
      if (this.statusDot) {
        this.statusDot.className = 'conn-dot dot-disconnected';
      }
      if (this.btnConnect) this.btnConnect.style.display = 'inline-flex';
      if (this.btnDisconnect) this.btnDisconnect.style.display = 'none';
      if (this.btnSimulate) {
        this.btnSimulate.innerHTML = '<span>▶</span> Run 1s Bench Simulator';
        this.btnSimulate.classList.remove('is-active');
      }
    } else if (status.state === 'error') {
      this.statusText.textContent = `Error: ${status.error || 'Serial read error'}`;
      if (this.statusDot) {
        this.statusDot.className = 'conn-dot dot-error';
      }
    }
  },

  escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
};

window.LiveFeedTabController = LiveFeedTabController;

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    LiveFeedTabController.init();
  });
} else {
  LiveFeedTabController.init();
}
