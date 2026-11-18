// ============================================================
// VOLTSENSE ESP32 TELEMETRY FIRMWARE
// Sensors: DS18B20 (Temp), ACS712-20A (Current), 16x2 I2C LCD (0x27)
// Outputs: 16x2 LCD, BluetoothSerial, Hardware USB Serial (115200 baud)
// Calibrated Zero-Point Offset: 0.81V
// ============================================================

#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <BluetoothSerial.h>

// --- PIN DEFINITIONS ---
const int TEMP_PIN = 4;        // DS18B20 1-Wire Data Pin (with 4.7k pullup)
const int CURRENT_PIN = 34;    // ACS712 Analog Out (after 1k:2.2k divider)
const int VOLTAGE_PIN = 35;    // Optional: Pack Voltage Divider Pin

// --- OBJECT INITIALIZATION ---
LiquidCrystal_I2C lcd(0x27, 16, 2); 
OneWire oneWire(TEMP_PIN);
DallasTemperature tempSensors(&oneWire);
BluetoothSerial SerialBT;

// --- TIMING VARIABLES ---
unsigned long lastUpdate = 0;
const unsigned long UPDATE_INTERVAL = 1000; // 1000ms bench / test interval

void setup() {
  Serial.begin(115200);
  
  // Start Bluetooth Serial
  SerialBT.begin("VoltSense_ESP32"); 
  
  // Initialize 16x2 LCD Display
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("VoltSense Boot..");

  // Initialize Temperature Sensor
  tempSensors.begin();
  
  delay(2000);
  lcd.clear();
}

void loop() {
  if (millis() - lastUpdate >= UPDATE_INTERVAL) {
    lastUpdate = millis();

    // 1. READ TEMPERATURE (DS18B20)
    tempSensors.requestTemperatures();
    float tempC = tempSensors.getTempCByIndex(0);

    // 2. READ CURRENT SENSOR (ACS712 with 10-sample noise filter)
    long rawAdcSum = 0;
    for (int i = 0; i < 10; i++) {
      rawAdcSum += analogRead(CURRENT_PIN);
      delay(2);
    }
    float rawADC = rawAdcSum / 10.0;
    
    // Convert 12-bit ADC (0-4095) to ESP32 pin voltage (0-3.3V)
    float pinVoltage = (rawADC / 4095.0) * 3.3;
    
    // Reverse 1k & 2.2k voltage divider ratio: (1k + 2.2k) / 2.2k = 1.4545
    float sensorVoltage = pinVoltage * 1.4545;
    
    // Convert to Amps using measured 0.81V zero-point offset (100mV/A sensitivity)
    float currentAmps = (sensorVoltage - 0.81) / 0.100;

    // 3. PACK VOLTAGE (Calculated or measured from analog divider)
    float packVoltage = 24.20 - (currentAmps * 0.05);

    // 4. UPDATE 16x2 LCD SCREEN
    lcd.setCursor(0, 0);
    lcd.print("Temp: ");
    lcd.print(tempC, 1); 
    lcd.print((char)223); // Degree symbol
    lcd.print("C  ");

    lcd.setCursor(0, 1);
    lcd.print("Curr: ");
    lcd.print(currentAmps, 2); 
    lcd.print("A  ");

    // 5. SEND JSON DATA OVER USB HARDWARE SERIAL & BLUETOOTH
    // Creates payload: {"temperature":25.5,"current":1.25,"voltage":24.15}
    String jsonPayload = "{";
    jsonPayload += "\"temperature\":" + String(tempC, 1) + ",";
    jsonPayload += "\"current\":" + String(currentAmps, 2) + ",";
    jsonPayload += "\"voltage\":" + String(packVoltage, 2);
    jsonPayload += "}";
    
    // Transmit to Web Serial API over USB COM Port
    Serial.println(jsonPayload);

    // Transmit to Bluetooth client
    SerialBT.println(jsonPayload);
  }
}
