// ============================================================
// WEBSERIALSERVICE.JS - Native Browser Web Serial API Manager
// Connects directly to ESP32 over USB COM Port (Baud 115200)
// Supports JSON, LCD multi-line format, and CSV telemetry feeds
// ============================================================

class WebSerialService {
  constructor() {
    this.port = null;
    this.reader = null;
    this.isConnected = false;
    this.baudRate = 115200;
    this.simulatedStreamTimer = null;
    this.isSimulating = false;
    this.noDataTimeout = null;
    this.hasReceivedFirstByte = false;

    // Persistent state for sensor readings (preserves readings when split across LCD lines)
    this.lastReadings = {
      temperature: 25.5,
      current: 1.25,
      voltage: 24.2,
      lastReceived: null
    };

    // Statistics
    this.stats = {
      bytesReceived: 0,
      packetsParsed: 0,
      lastPacketTime: null,
      errors: 0
    };

    // Callback listeners
    this.listeners = {
      data: [],      // (parsedPayload) => {}
      line: [],      // (rawString) => {}
      status: []     // (statusObj) => {}
    };
  }

  isSupported() {
    return 'serial' in navigator;
  }

  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
    return () => {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    };
  }

  emit(event, payload) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => {
        try {
          cb(payload);
        } catch (err) {
          console.error(`[WebSerial] Error in ${event} listener:`, err);
        }
      });
    }
  }

  /**
   * Request USB COM Port from user and open stream at 115200 baud
   */
  async connect(baudRate = 115200) {
    if (!this.isSupported()) {
      const err = new Error('Web Serial API is not supported in this browser. Please use Google Chrome, Microsoft Edge, or Opera.');
      this.emit('status', { state: 'unsupported', error: err.message });
      throw err;
    }

    if (this.isSimulating) {
      this.stopSimulation();
    }

    this.baudRate = parseInt(baudRate, 10) || 115200;

    try {
      this.emit('status', { state: 'requesting', message: 'Selecting COM Port...' });
      
      // Prompts user to pick the ESP32 CP2102/CH340 USB Serial Port
      this.port = await navigator.serial.requestPort();
      
      await this.port.open({ baudRate: this.baudRate });
      this.isConnected = true;
      this.hasReceivedFirstByte = false;
      this.stats.bytesReceived = 0;
      this.stats.packetsParsed = 0;

      const portInfo = this.port.getInfo ? this.port.getInfo() : {};
      const usbVendor = portInfo.usbVendorId ? `USB: 0x${portInfo.usbVendorId.toString(16)}` : 'USB Serial';

      this.emit('status', { 
        state: 'connected', 
        message: `Connected (${this.baudRate} baud · ${usbVendor})`,
        portInfo
      });

      this.emit('line', `// [SYSTEM] Connected to COM port at ${this.baudRate} baud. Listening for ESP32 serial data...`);

      // Watchdog: If 3.5 seconds pass and 0 bytes arrive from ESP32, guide the user
      if (this.noDataTimeout) clearTimeout(this.noDataTimeout);
      this.noDataTimeout = setTimeout(() => {
        if (this.isConnected && !this.hasReceivedFirstByte) {
          this.emit('line', '// [HARDWARE NOTICE] Port is connected, but 0 bytes received from ESP32 yet.');
          this.emit('line', '// Tip: In your ESP32 code, ensure you have Serial.println(jsonPayload); inside void loop() so it transmits via USB cable (not only SerialBT).');
          this.emit('status', {
            state: 'connected',
            message: `Connected · Waiting for Serial output (Ensure Serial.println is in ESP32 loop)`
          });
        }
      }, 3500);

      console.log(`[WebSerial] Opened serial port at ${this.baudRate} baud`);

      // Begin background read loop
      this.startReading();
      return true;
    } catch (err) {
      this.isConnected = false;
      this.port = null;
      console.warn('[WebSerial] Connection failed/cancelled:', err.message);
      this.emit('status', { state: 'disconnected', error: err.message });
      throw err;
    }
  }

  /**
   * Background stream reader with TextDecoder and line-by-line parsing
   */
  async startReading() {
    let lineBuffer = '';
    const decoder = new TextDecoder('utf-8', { fatal: false });

    while (this.port && this.port.readable && this.isConnected) {
      this.reader = this.port.readable.getReader();

      try {
        while (this.isConnected) {
          const { value, done } = await this.reader.read();
          if (done) break;
          if (value && value.length > 0) {
            // First byte received from physical ESP32
            if (!this.hasReceivedFirstByte) {
              this.hasReceivedFirstByte = true;
              if (this.noDataTimeout) {
                clearTimeout(this.noDataTimeout);
                this.noDataTimeout = null;
              }
              this.emit('line', '// [SYSTEM] ✓ ESP32 serial data detected! Streaming live hardware values...');
              this.emit('status', {
                state: 'connected',
                message: `Connected & Streaming Live (${this.baudRate} baud · USB Serial)`
              });
            }

            this.stats.bytesReceived += value.byteLength || value.length;
            const textChunk = decoder.decode(value, { stream: true });
            lineBuffer += textChunk;

            // Split by newline (\r\n or \n or \r)
            const lines = lineBuffer.split(/\r?\n|\r/);
            // The last item is the remaining partial line
            lineBuffer = lines.pop();

            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed) {
                this.processIncomingLine(trimmed);
              }
            }
          }
        }
      } catch (err) {
        if (this.isConnected) {
          console.warn('[WebSerial] Read stream error:', err.message);
          this.stats.errors++;
          this.emit('status', { state: 'error', error: err.message });
        }
      } finally {
        if (this.reader) {
          try {
            this.reader.releaseLock();
          } catch (e) {}
          this.reader = null;
        }
      }
    }
  }

  /**
   * Universal Serial Parser for ESP32:
   * Accepts:
   * 1. Standard JSON payload: {"temperature":25.5,"current":1.25,"voltage":24.2}
   * 2. LCD Display text:
   *    Line 1: Temp: 25.5°C
   *    Line 2: Curr: 1.25A
   * 3. Combined LCD text: Temp: 25.5°C  Curr: 1.25A
   * 4. Plain CSV numerical line: 25.5, 1.25 or 25.5, 1.25, 24.2
   * 5. Key-Value pairs: temp=25.5, current=1.25
   */
  processIncomingLine(line) {
    this.emit('line', line);

    let tempFound = null;
    let currFound = null;
    let voltFound = null;

    // Strategy 1: JSON Object extraction (even if enclosed in other text)
    const jsonMatch = line.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const obj = JSON.parse(jsonMatch[0]);
        // Temperature variants
        for (const k of ['temperature', 'temp', 'tempC', 'temp_c', 't', 'Temperature', 'Temp']) {
          if (obj[k] !== undefined && !isNaN(obj[k])) {
            tempFound = parseFloat(obj[k]);
            break;
          }
        }
        // Current variants
        for (const k of ['current', 'curr', 'currentAmps', 'current_amps', 'currA', 'i', 'Current', 'Curr', 'amps', 'Amps']) {
          if (obj[k] !== undefined && !isNaN(obj[k])) {
            currFound = parseFloat(obj[k]);
            break;
          }
        }
        // Voltage variants
        for (const k of ['voltage', 'volt', 'pack_voltage', 'voltV', 'v', 'Voltage', 'Volt']) {
          if (obj[k] !== undefined && !isNaN(obj[k])) {
            voltFound = parseFloat(obj[k]);
            break;
          }
        }
      } catch (e) {
        // Fall through to regex extraction
      }
    }

    // Strategy 2: Labeled Text / LCD Format Regex Extraction
    // Handles "Temp: 25.5°C", "Temp: 25.5 C", "Temp: 25.5", "temperature: 25.5", "T: 25.5"
    if (tempFound === null) {
      const tMatch = line.match(/(?:temperature|temp_c|tempc|temp|t)\s*[:= ]\s*([0-9.-]+)/i);
      if (tMatch) {
        tempFound = parseFloat(tMatch[1]);
      }
    }

    // Handles "Curr: 1.25A", "Curr: 1.25 A", "Curr: 1.25", "current: 1.25", "I: 1.25"
    if (currFound === null) {
      const cMatch = line.match(/(?:current_amps|currentamps|current|curr_a|curra|curr|amps|amp|i)\s*[:= ]\s*([0-9.-]+)/i);
      if (cMatch) {
        currFound = parseFloat(cMatch[1]);
      }
    }

    // Handles "Volt: 24.2V", "Volt: 24.2 V", "Volt: 24.2", "voltage: 24.2", "V: 24.2"
    if (voltFound === null) {
      const vMatch = line.match(/(?:pack_voltage|voltage|volt_v|voltv|volt|v)\s*[:= ]\s*([0-9.-]+)/i);
      if (vMatch) {
        voltFound = parseFloat(vMatch[1]);
      }
    }

    // Strategy 3: Plain CSV / Numerical values (e.g. "25.5, 1.25" or "25.5, 1.25, 24.2")
    if (tempFound === null && currFound === null) {
      const csvParts = line.split(/[,;\t]/).map(s => s.trim()).filter(Boolean);
      if (csvParts.length >= 2 && !isNaN(csvParts[0]) && !isNaN(csvParts[1])) {
        const p1 = parseFloat(csvParts[0]);
        const p2 = parseFloat(csvParts[1]);
        tempFound = p1;
        currFound = p2;
        if (csvParts.length >= 3 && !isNaN(csvParts[2])) {
          voltFound = parseFloat(csvParts[2]);
        }
      }
    }

    // If any sensor reading was decoded, update persistent state buffer
    if (tempFound !== null || currFound !== null || voltFound !== null) {
      if (tempFound !== null) this.lastReadings.temperature = tempFound;
      if (currFound !== null) this.lastReadings.current = currFound;
      if (voltFound !== null) {
        this.lastReadings.voltage = voltFound;
      } else {
        // Derive pack terminal voltage with realistic internal resistance (IR drop): V = V_ocv - I * 0.045
        const activePackId = window.AppState ? window.AppState.get('activePackId') : 'pack-1';
        const profile = (typeof BATTERY_PACK_PROFILES !== 'undefined' && BATTERY_PACK_PROFILES[activePackId])
          ? BATTERY_PACK_PROFILES[activePackId]
          : null;
        const baseV = profile ? profile.currentStatus.voltage : 24.4;
        this.lastReadings.voltage = parseFloat((baseV - (this.lastReadings.current * 0.045)).toFixed(2));
      }

      this.lastReadings.lastReceived = new Date();

      const normalized = {
        temperature: this.lastReadings.temperature,
        current: this.lastReadings.current,
        voltage: this.lastReadings.voltage,
        rawLine: line,
        timestamp: new Date()
      };

      this.stats.packetsParsed++;
      this.stats.lastPacketTime = new Date();
      this.emit('data', normalized);
    }
  }

  /**
   * Gracefully close the serial connection
   */
  async disconnect() {
    this.isConnected = false;

    if (this.noDataTimeout) {
      clearTimeout(this.noDataTimeout);
      this.noDataTimeout = null;
    }

    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch (e) {}
      try {
        this.reader.releaseLock();
      } catch (e) {}
      this.reader = null;
    }

    if (this.port) {
      try {
        await this.port.close();
      } catch (e) {
        console.warn('[WebSerial] Error closing port:', e.message);
      }
      this.port = null;
    }

    this.emit('status', { state: 'disconnected', message: 'Disconnected (Ready to Connect)' });
    console.log('[WebSerial] Port closed.');
  }

  /**
   * Built-in Bench Hardware Simulator
   * Generates exact payloads matching the user's updated 0.81V zero-point ESP32 code every 1000ms
   */
  startSimulation() {
    if (this.isConnected) {
      this.disconnect();
    }

    if (this.simulatedStreamTimer) {
      clearInterval(this.simulatedStreamTimer);
      this.simulatedStreamTimer = null;
    }

    this.isSimulating = true;
    this.emit('status', { 
      state: 'simulating', 
      message: 'ESP32 Bench Simulator Active (1000ms loop)' 
    });

    let step = 0;
    const tick = () => {
      step++;
      // Realistic simulated DS18B20 temperature
      const tempC = parseFloat((25.5 + Math.sin(step * 0.1) * 1.2 + (Math.random() - 0.5) * 0.2).toFixed(1));
      
      // Realistic ACS712 current based on user's calibrated 0.81V zero-point:
      // currentAmps = (sensorVoltage - 0.81) / 0.100;
      const currentAmps = parseFloat((1.25 + Math.sin(step * 0.12) * 0.35 + (Math.random() - 0.5) * 0.08).toFixed(2));

      // Realistic pack terminal voltage with mild ripple and IR load drop
      const voltageV = parseFloat((24.25 - (currentAmps * 0.06) + (Math.random() - 0.5) * 0.05).toFixed(2));

      // Emits the exact jsonPayload string from the user's ESP32 sketch:
      // {"temperature":25.5,"current":1.25,"voltage":24.2}
      const jsonPayload = `{"temperature":${tempC.toFixed(1)},"current":${currentAmps.toFixed(2)},"voltage":${voltageV.toFixed(2)}}`;

      this.stats.bytesReceived += jsonPayload.length + 2;
      this.processIncomingLine(jsonPayload);
    };

    tick();
    this.simulatedStreamTimer = setInterval(tick, 1000); // exact 1000ms matching UPDATE_INTERVAL in ESP32 code

    console.log('[WebSerial] Started bench test simulation mode');
  }

  stopSimulation() {
    if (this.simulatedStreamTimer) {
      clearInterval(this.simulatedStreamTimer);
      this.simulatedStreamTimer = null;
    }
    this.isSimulating = false;
    this.emit('status', { 
      state: 'disconnected', 
      message: 'Bench Simulator Paused (Ready to Connect USB)' 
    });
  }
}

// Global singleton instance
window.WebSerialService = new WebSerialService();
