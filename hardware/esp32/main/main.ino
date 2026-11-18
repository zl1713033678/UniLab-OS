#include <WiFi.h>
#include <HTTPClient.h>
#include <ESPmDNS.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <math.h>

// ================= 1. 用户配置区域（烧录前替换为本地实验网参数，切勿提交真实密钥） =================
#ifndef WIFI_SSID
#define WIFI_SSID "YOUR_LAB_WIFI_SSID"
#endif
#ifndef WIFI_PASSWORD
#define WIFI_PASSWORD "YOUR_LAB_WIFI_PASSWORD"
#endif
#ifndef MDNS_HOST_NAME
#define MDNS_HOST_NAME "smartlab"
#endif
#ifndef FALLBACK_SERVER_IP
#define FALLBACK_SERVER_IP "192.168.1.100"
#endif
#ifndef SERVER_PORT
#define SERVER_PORT 8000
#endif
#ifndef LAB_HARDWARE_TOKEN
#define LAB_HARDWARE_TOKEN "UNILAB_HW_SECRET_2026"
#endif
#ifndef DEVICE_CODE
#define DEVICE_CODE "CNC-01"
#endif

// ================= 2. 引脚与 ACS712 硬件参数 =================
#define ACS712_PIN 34
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

const float ADC_VREF = 3.3f;
const float ADC_MAX = 4095.0f;
const float SENSITIVITY = 0.066f;  // 30A 版本 ACS712 灵敏度 66mV/A
const float NOISE_FLOOR = 0.04f;
const float RUNNING_CURRENT_THRESHOLD = 0.50f;

String resolvedServerHost = "";
unsigned long lastTelemetryMs = 0;
const unsigned long TELEMETRY_INTERVAL_MS = 1500;
float baseZeroVoltage = 1.65f;

void calibrateSensorZero() {
  long sum = 0;
  for (int i = 0; i < 200; i++) {
    sum += analogRead(ACS712_PIN);
    delay(2);
  }
  baseZeroVoltage = ((float)sum / 200.0f) * (ADC_VREF / ADC_MAX);
}

void measureACCurrent(float &outCurrent, float &outMaxDiff) {
  const int sampleCount = 100;
  double sumSqDiff = 0.0;
  int minAdc = 4095;
  int maxAdc = 0;

  for (int i = 0; i < sampleCount; i++) {
    int val = analogRead(ACS712_PIN);
    if (val < minAdc) minAdc = val;
    if (val > maxAdc) maxAdc = val;
    float v = val * (ADC_VREF / ADC_MAX);
    float diff = v - baseZeroVoltage;
    sumSqDiff += (double)diff * (double)diff;
    delay(1);
  }

  float vrms = sqrt(sumSqDiff / sampleCount);
  float amps = vrms / SENSITIVITY;
  if (amps < NOISE_FLOOR) {
    amps = 0.0f;
  }
  outCurrent = amps;
  outMaxDiff = (maxAdc - minAdc) * (ADC_VREF / ADC_MAX);
}

void resolveServerViaMdns() {
  if (!MDNS.begin("esp32-unilab-node")) {
    resolvedServerHost = FALLBACK_SERVER_IP;
    return;
  }
  IPAddress serverIp = MDNS.queryHost(MDNS_HOST_NAME, 1500);
  if (serverIp != IPAddress(0, 0, 0, 0)) {
    resolvedServerHost = serverIp.toString();
  } else {
    resolvedServerHost = FALLBACK_SERVER_IP;
  }
}

void renderOledStatus(float amps, const String &statusText, const String &httpNote) {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.printf("UniLab Node: %s\n", DEVICE_CODE);
  display.printf("IP: %s\n", WiFi.localIP().toString().c_str());
  display.printf("GW: %s:%d\n", resolvedServerHost.c_str(), SERVER_PORT);
  display.drawLine(0, 26, 127, 26, SSD1306_WHITE);
  display.setTextSize(2);
  display.setCursor(0, 31);
  display.printf("%.2f A", amps);
  display.setTextSize(1);
  display.setCursor(0, 52);
  display.printf("%s | %s", statusText.c_str(), httpNote.c_str());
  display.display();
}

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  Wire.begin();
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("UniLab-OS ESP32 Booting");
  display.display();

  calibrateSensorZero();
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  resolveServerViaMdns();
}

void loop() {
  if (millis() - lastTelemetryMs < TELEMETRY_INTERVAL_MS) {
    return;
  }
  lastTelemetryMs = millis();

  float amps = 0.0f;
  float vDiff = 0.0f;
  measureACCurrent(amps, vDiff);
  String reportState = (amps >= RUNNING_CURRENT_THRESHOLD) ? "IN_USE" : "IDLE";

  String httpNote = "NO_WIFI";
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    String url = String("http://") + resolvedServerHost + ":" + String(SERVER_PORT) + "/api/v1/telemetry/ingest";
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-Lab-Hardware-Token", LAB_HARDWARE_TOKEN);

    String payload = String("{")
      + "\"device_code\":\"" + String(DEVICE_CODE) + "\","
      + "\"status\":\"" + reportState + "\","
      + "\"current\":" + String(amps, 3) + ","
      + "\"voltage\":220.0,"
      + "\"source_type\":\"ESP32_ACS712\","
      + "\"raw_data\":{\"adc_diff\":" + String(vDiff, 3) + ",\"current\":" + String(amps, 3) + ",\"voltage\":220.0}"
      + "}";

    int code = http.POST(payload);
    httpNote = (code >= 200 && code < 300) ? ("HTTP " + String(code)) : ("ERR " + String(code));
    http.end();
  }

  renderOledStatus(amps, reportState, httpNote);
}
