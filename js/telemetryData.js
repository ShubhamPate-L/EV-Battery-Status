// Generate 12-hour realistic mock telemetry data (720 minutes, 1 per minute)
function generateTelemetryData() {
  const data = [];
  const startTime = new Date();
  startTime.setHours(startTime.getHours() - 12); // Start 12 hours ago

  let soc = 85; // Starting SoC
  let voltage = 24.2;
  let temp = 28;

  for (let i = 0; i < 720; i++) {
    const currentTime = new Date(startTime.getTime() + i * 60000); // Add i minutes

    // Realistic current draw (mostly discharging with occasional charging)
    let current;
    if (i % 120 === 0 && i > 0) {
      // Every 2 hours, simulate a charging pulse
      current = -40 + Math.random() * 20; // -60 to -20 mA charging
    } else {
      // Normal discharge with ripples
      current = 80 + Math.random() * 40; // 80-120 mA discharging
      if (Math.random() < 0.05) current += 30; // 5% chance of spike
    }

    // SoC decreases based on current draw (very gradual)
    soc -= (Math.abs(current) / 10000); // Tiny decrease per minute
    soc = Math.max(15, Math.min(100, soc)); // Clamp 15-100%

    // Voltage correlates roughly with SoC
    voltage = 19.5 + (soc / 100) * 5.5; // 19.5-25V based on SoC
    voltage += (Math.random() - 0.5) * 0.2; // Add noise

    // Temperature fluctuates slightly
    temp = 28 + Math.sin(i / 100) * 3 + (Math.random() - 0.5) * 1; // 25-31°C
    temp = Math.max(15, Math.min(45, temp));

    // Format data
    const dateStr = currentTime.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    const timeStr = currentTime.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
    data.push({
      timestamp: currentTime,
      date: dateStr,
      time: timeStr,
      soc: parseFloat(soc.toFixed(1)),
      voltage: parseFloat(voltage.toFixed(2)),
      current: parseFloat(current.toFixed(1)),
      temp: parseFloat(temp.toFixed(1))
    });
  }

  return data;
}

// Generate and store globally
const TELEMETRY_DATA = generateTelemetryData();


// ---------- LIVE MODE: generates one new minute of data at a time ----------
let liveState = { ...TELEMETRY_DATA[TELEMETRY_DATA.length - 1] };

function generateNextLivePoint() {
  const nextTime = new Date(liveState.timestamp.getTime() + 60000); // +1 simulated minute

  let current = 80 + Math.random() * 40;
  if (Math.random() < 0.05) current += 30;
  if (Math.random() < 0.08) current = -40 + Math.random() * 20; // occasional charge pulse

  let soc = liveState.soc - (Math.abs(current) / 10000);
  soc = Math.max(15, Math.min(100, soc));

  let voltage = 19.5 + (soc / 100) * 5.5 + (Math.random() - 0.5) * 0.2;
  let temp = liveState.temp + (Math.random() - 0.5) * 0.6;
  temp = Math.max(15, Math.min(45, temp));

  const point = {
    timestamp: nextTime,
    date: nextTime.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
    time: nextTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
    soc: parseFloat(soc.toFixed(1)),
    voltage: parseFloat(voltage.toFixed(2)),
    current: parseFloat(current.toFixed(1)),
    temp: parseFloat(temp.toFixed(1))
  };

  liveState = point;
  return point;
}