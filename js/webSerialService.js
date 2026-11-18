// ============================================================
// WEBSERIALSERVICE.JS - Native Browser Web Serial API Manager
// Connects directly to ESP32 over USB COM Port (Baud 115200)
// ============================================================

class WebSerialService {
  constructor() {
    this.port = null;
    this.reader = null;
    this.readableStreamClosed = null;
    this.isConnected = false;
    this.baudRate = 115200;
    this.simulatedStreamTimer = null;
    this.isSimulating = false;

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

      const portInfo = this.port.getInfo ? this.port.getInfo() : {};
      const usbVendor = portInfo.usbVendorId ? `USB: 0x${portInfo.usbVendorId.toString(16)}` : 'USB Serial';

      this.emit('status', { 
        state: 'connected', 
        message: `Connected (${this.baudRate} baud · ${usbVendor})`,
        portInfo
      });

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

    while (this.port && this.port.readable && this.isConnected) {
      const textDecoder = new TextDecoderStream();
      this.readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
      this.reader = textDecoder.readable.getReader();

      try {
        while (true) {
          const { value, done } = await this.reader.read();
          if (done) break;
          if (value) {
            this.stats.bytesReceived += value.length;
            lineBuffer += value;

            // Split by newline
            const lines = lineBuffer.split(/\r?\n/);
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
          this.reader.releaseLock();
        }
      }
    }
  }

  /**
   * Parses incoming serial line from ESP32:
   * Accepts:
   * 1. JSON format: {"temperature":25.5,"current":1.25,"voltage":24.2}
   * 2. Raw Text / LCD format: Temp: 25.5 C  Curr: 1.25 A  Volt: 24.2 V
   */
  processIncomingLine(line) {
    this.emit('line', line);

    let parsed = null;

    // 1. Try standard JSON payload (from ESP32 sketch String jsonPayload)
    if (line.startsWith('{') && line.endsWith('}')) {
      try {
        parsed = JSON.parse(line);
      } catch (e) {
        // Fallback to loose extraction
      }
    }

    // 2. Fallback regex parser for either JSON or plaintext
    if (!parsed) {
      const tempMatch = line.match(/(?:temperature|"temperature"|Temp|temp):\s*([0-9.-]+)/i);
      const currMatch = line.match(/(?:current|"current"|Curr|curr):\s*([0-9.-]+)/i);
      const voltMatch = line.match(/(?:voltage|"voltage"|Volt|volt|V):\s*([0-9.-]+)/i);

      if (tempMatch || currMatch || voltMatch) {
        parsed = {
          temperature: tempMatch ? parseFloat(tempMatch[1]) : undefined,
          current: currMatch ? parseFloat(currMatch[1]) : undefined,
          voltage: voltMatch ? parseFloat(voltMatch[1]) : undefined
        };
      }
    }

    if (parsed && (parsed.temperature !== undefined || parsed.current !== undefined || parsed.voltage !== undefined)) {
      const tempVal = parseFloat(parsed.temperature !== undefined ? parsed.temperature : 25.0);
      const currVal = parseFloat(parsed.current !== undefined ? parsed.current : 0.0);

      // Determine voltage: use explicitly measured voltage if provided in payload;
      // otherwise derive realistic pack terminal voltage (nominal - I*R_int)
      let voltVal;
      if (parsed.voltage !== undefined && !isNaN(parsed.voltage)) {
        voltVal = parseFloat(parsed.voltage);
      } else {
        const activePackId = window.AppState ? window.AppState.get('activePackId') : 'pack-1';
        const profile = (typeof BATTERY_PACK_PROFILES !== 'undefined' && BATTERY_PACK_PROFILES[activePackId])
          ? BATTERY_PACK_PROFILES[activePackId]
          : null;
        const baseV = profile ? profile.currentStatus.voltage : 24.4;
        // Internal resistance drop (IR drop): V = V_ocv - I * 0.045
        voltVal = parseFloat((baseV - (currVal * 0.045)).toFixed(2));
      }

      const normalized = {
        temperature: tempVal,
        current: currVal,
        voltage: voltVal,
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

    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch (e) {
        // Ignore abort errors
      }
    }

    if (this.readableStreamClosed) {
      try {
        await this.readableStreamClosed.catch(() => {});
      } catch (e) {}
    }

    if (this.port) {
      try {
        await this.port.close();
      } catch (e) {
        console.warn('[WebSerial] Error closing port:', e.message);
      }
    }

    this.port = null;
    this.reader = null;
    this.emit('status', { state: 'disconnected', message: 'Disconnected' });
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
      // Normal battery discharge or charging around 1.1A to 1.6A
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
