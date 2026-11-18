#!/usr/bin/env python3
"""
VoltSense — Local CSV Telemetry Logger
Connects to ESP32 over USB Serial (115200 baud) and logs telemetry directly to a local CSV file.
Usage:
    python log_telemetry_csv.py              # Auto-detects COM port
    python log_telemetry_csv.py COM3         # Specifies port
    python log_telemetry_csv.py COM3 my.csv  # Specifies port and filename
"""

import sys
import time
import os
import csv
import json
import re
from datetime import datetime

try:
    import serial
    import serial.tools.list_ports
except ImportError:
    print("[ERROR] pyserial is not installed. Run: pip install pyserial")
    sys.exit(1)

DEFAULT_BAUD = 115200
DEFAULT_CSV_FILE = "voltsense_telemetry_log.csv"

CSV_HEADERS = [
    "Timestamp_ISO",
    "Date",
    "Time",
    "Temperature_C",
    "Current_A",
    "Voltage_V",
    "Power_W",
    "Raw_Payload"
]

def find_esp32_port():
    """Auto-detects potential ESP32 USB serial ports."""
    ports = list(serial.tools.list_ports.comports())
    if not ports:
        return None
    
    print("\n--- Available COM Ports ---")
    esp_port = None
    for p in ports:
        desc = p.description or ""
        hwid = p.hwid or ""
        print(f"  • {p.device}: {desc} ({hwid})")
        # Check common ESP32 USB UART chipsets (CP210x, CH340, FTDI)
        if any(chip in desc.upper() or chip in hwid.upper() for chip in ["CP210", "CH340", "USB SERIAL", "UART", "ESP32"]):
            if not esp_port:
                esp_port = p.device
                
    return esp_port or ports[0].device

def parse_line(line_str):
    """Parses JSON or key-value format from ESP32."""
    line_str = line_str.strip()
    if not line_str:
        return None
    
    # 1. Try standard JSON
    if line_str.startswith("{") and line_str.endswith("}"):
        try:
            return json.loads(line_str)
        except Exception:
            pass
            
    # 2. Try regex extraction
    temp_m = re.search(r'(?:temperature|temp|Temp):\s*([0-9.-]+)', line_str, re.I)
    curr_m = re.search(r'(?:current|curr|Curr):\s*([0-9.-]+)', line_str, re.I)
    volt_m = re.search(r'(?:voltage|volt|Volt|V):\s*([0-9.-]+)', line_str, re.I)
    
    if temp_m or curr_m or volt_m:
        return {
            "temperature": float(temp_m.group(1)) if temp_m else None,
            "current": float(curr_m.group(1)) if curr_m else None,
            "voltage": float(volt_m.group(1)) if volt_m else None
        }
    return None

def main():
    print("=" * 65)
    print("  VoltSense — Real-Time Local CSV Telemetry Logger")
    print("=" * 65)

    port_name = sys.argv[1] if len(sys.argv) > 1 else None
    csv_filename = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_CSV_FILE

    if not port_name:
        port_name = find_esp32_port()
        if not port_name:
            print("\n[ERROR] No active COM ports found. Connect your ESP32 via USB and retry.")
            sys.exit(1)
        print(f"\n[INFO] Auto-selected COM port: {port_name}")
    else:
        print(f"\n[INFO] Target COM port: {port_name}")

    print(f"[INFO] Baud Rate: {DEFAULT_BAUD}")
    print(f"[INFO] Output CSV: {os.path.abspath(csv_filename)}")

    # Check if CSV exists, if not write header
    file_exists = os.path.isfile(csv_filename)
    csv_file = open(csv_filename, mode="a", newline="", encoding="utf-8")
    csv_writer = csv.writer(csv_file)

    if not file_exists or os.path.getsize(csv_filename) == 0:
        csv_writer.writerow(CSV_HEADERS)
        csv_file.flush()
        print(f"[INFO] Initialized new CSV file with headers: {', '.join(CSV_HEADERS)}")
    else:
        print(f"[INFO] Appending to existing CSV file ({os.path.getsize(csv_filename)} bytes).")

    # Open Serial connection
    try:
        ser = serial.Serial(port_name, DEFAULT_BAUD, timeout=2)
        time.sleep(1.5) # allow ESP32 to settle
        print(f"[SUCCESS] Connected to {port_name} at {DEFAULT_BAUD} baud.")
        print("[INFO] Logging live telemetry... Press Ctrl+C to stop.\n")
    except Exception as e:
        print(f"\n[ERROR] Could not open {port_name}: {e}")
        csv_file.close()
        sys.exit(1)

    record_count = 0
    try:
        while True:
            raw_line = ser.readline().decode("utf-8", errors="replace").strip()
            if not raw_line:
                continue

            parsed = parse_line(raw_line)
            if not parsed:
                continue

            now = datetime.now()
            iso_time = now.isoformat()
            date_str = now.strftime("%Y-%m-%d")
            time_str = now.strftime("%H:%M:%S")

            temp = parsed.get("temperature")
            curr = parsed.get("current")
            volt = parsed.get("voltage")

            # Fallback voltage if not provided
            if volt is None and curr is not None:
                volt = round(24.20 - (curr * 0.05), 2)
            
            # Power P = V * I
            power = round(abs(volt * curr), 2) if (volt is not None and curr is not None) else None

            row = [
                iso_time,
                date_str,
                time_str,
                f"{temp:.1f}" if temp is not None else "",
                f"{curr:.2f}" if curr is not None else "",
                f"{volt:.2f}" if volt is not None else "",
                f"{power:.2f}" if power is not None else "",
                raw_line
            ]

            csv_writer.writerow(row)
            csv_file.flush() # ensure data is written immediately to disk

            record_count += 1
            print(f"[{time_str}] #{record_count:04d} -> Temp: {temp}°C | Curr: {curr}A | Volt: {volt}V | Power: {power}W")

    except KeyboardInterrupt:
        print("\n\n[INFO] Stopped logging by user.")
    except Exception as e:
        print(f"\n[ERROR] Serial reading exception: {e}")
    finally:
        ser.close()
        csv_file.close()
        print(f"[SUMMARY] Total records written to '{csv_filename}': {record_count}")
        print(f"[SUMMARY] File saved at: {os.path.abspath(csv_filename)}")

if __name__ == "__main__":
    main()
