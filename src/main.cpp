#include <Arduino.h>
#include <WiFi.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include "LittleFS.h"
#include <ArduinoJson.h>
#include "max6675.h"
#include <ElegantOTA.h>

#include "secrets.h"

AsyncWebServer server(80);
AsyncWebSocket ws("/ws");

// Json Variable to Hold Sensor Readings
JsonDocument readings;
String jsonString;

// Timer variables
unsigned long lastTime = 0;
unsigned long timerDelay = 250;

int relay = 21;
int thermoDO = 19;
int thermoCS = 23;
int thermoCLK = 5;

MAX6675 thermocouple(thermoCLK, thermoCS, thermoDO);

float temperature = 0;
int targetTemp = 300;
float setOverShoot = 20;
float setUnderShoot = 20;
float derivedOverShoot = targetTemp;
float derivedUnderShoot = targetTemp;
unsigned long lastSwitch = 0;
unsigned long autoSwitchDelay = 20000; // 20s
unsigned long pwmSwitchDelay = 5000;   // 5s

String mode = "off";

// Get Sensor Readings and return JSON object
String getSensorReadings()
{
  temperature = thermocouple.readCelsius();

  readings["temperature"] = temperature;

  if (digitalRead(relay) == HIGH)
  {
    readings["relais"] = 1;
  }
  else
  {
    readings["relais"] = 0;
  }

  readings["target_temp"] = targetTemp;
  readings["derived_overshoot"] = derivedOverShoot;
  readings["derived_undershoot"] = derivedUnderShoot;
  readings["mode"] = mode;

  serializeJson(readings, jsonString);
  return jsonString;
}

// Initialize LittleFS
void initLittleFS()
{
  if (!LittleFS.begin(true))
  {
    Serial.println("An error has occurred while mounting LittleFS");
  }
  Serial.println("LittleFS mounted successfully");
}

// Initialize WiFi
void initWiFi()
{

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi ..");
  while (WiFi.status() != WL_CONNECTED)
  {
    Serial.print('.');
    delay(1000);
  }
  Serial.println(WiFi.localIP());
}

void notifyClients(String sensorReadings)
{
  ws.textAll(sensorReadings);
}

void resetDerivedValues()
{
  derivedOverShoot = targetTemp;
  derivedUnderShoot = targetTemp;
}

void handleWebSocketMessage(void *arg, uint8_t *data, size_t len)
{
  AwsFrameInfo *info = (AwsFrameInfo *)arg;
  if (info->final && info->index == 0 && info->len == len && info->opcode == WS_TEXT)
  {
    data[len] = 0;
    String message = (char *)data;
    if (strcmp((char *)data, "getReadings") == 0)
    {
      String sensorReadings = getSensorReadings();
      notifyClients(sensorReadings);
    };
    if (strcmp((char *)data, "switchRelais") == 0)
    {
      Serial.printf("\nSwitch Relais");
      if (digitalRead(relay) == HIGH)
      {
        digitalWrite(relay, LOW);
        lastSwitch = millis();
      }
      else
      {
        digitalWrite(relay, HIGH);
        lastSwitch = millis();
      }
      resetDerivedValues();
    }
    if (message.startsWith("setTargetTemp"))
    {
      String target = message.substring(15, 18);
      targetTemp = target.toFloat();
      Serial.printf("\nTarget temp set to ");
      Serial.print(targetTemp);
      Serial.printf("°C");
    }
    if (message.startsWith("setMode"))
    {
      if (message.indexOf("auto_switch") > 0)
      {
        mode = "auto_switch";
      }
      else if (message.indexOf("pwm") > 0)
      {
        mode = "pwm";
      }
      else
      {
        mode = "off";
        digitalWrite(relay, LOW);
        lastSwitch = millis();
      }
      Serial.printf("\nMode set to ");
      Serial.print(mode);
    }
  }
}

void onEvent(AsyncWebSocket *server, AsyncWebSocketClient *client, AwsEventType type, void *arg, uint8_t *data, size_t len)
{
  switch (type)
  {
  case WS_EVT_CONNECT:
    Serial.printf("WebSocket client #%u connected from %s\n", client->id(), client->remoteIP().toString().c_str());
    break;
  case WS_EVT_DISCONNECT:
    Serial.printf("WebSocket client #%u disconnected\n", client->id());
    break;
  case WS_EVT_DATA:
    handleWebSocketMessage(arg, data, len);
    break;
  case WS_EVT_PONG:
  case WS_EVT_ERROR:
    break;
  }
}

void initWebSocket()
{
  ws.onEvent(onEvent);
  server.addHandler(&ws);
}

void regulateRelais()
{
  if (mode == "auto_switch")
  {
    float sinceLastSwitch = millis() - lastSwitch;
    float fiveMinutesInMillis = 5 * 60 * 1000;
    float shootFactor = sinceLastSwitch / fiveMinutesInMillis;

    float overshoot = setOverShoot * shootFactor; // derive over 5 mins -> 1 min eq. 3°C, 5mins eq. 15°C
    float dirivedOvershoot = min(overshoot, setOverShoot);

    float undershoot = setUnderShoot * shootFactor; // derive over 5 min -> 1 min eq. 3°C, 5mins eq. 15°C
    float dirivedUndershoot = min(undershoot, setUnderShoot);

    float overShootCorrectedTarget = derivedOverShoot = targetTemp - dirivedOvershoot;
    float underShootCorrectedTarget = derivedUnderShoot = targetTemp + dirivedUndershoot;

    if ((millis() - lastSwitch) > autoSwitchDelay)
    {

      if (temperature > overShootCorrectedTarget) // > 280°C
      {
        if (digitalRead(relay) == HIGH)
        {
          digitalWrite(relay, LOW);
          lastSwitch = millis();
          resetDerivedValues();
        }
      }
    }
    if ((millis() - lastSwitch) > autoSwitchDelay)
    {
      if (temperature < underShootCorrectedTarget) // < 320°C
      {
        if (digitalRead(relay) == LOW)
        {
          digitalWrite(relay, HIGH);
          lastSwitch = millis();
          resetDerivedValues();
        }
      }
    }
  }

  if (mode == "pwm")
  {
    if ((millis() - lastSwitch) > pwmSwitchDelay)
    {
      if (digitalRead(relay) == HIGH)
      {
        digitalWrite(relay, LOW);
        lastSwitch = millis();
      }
      else if (digitalRead(relay) == LOW)
      {
        digitalWrite(relay, HIGH);
        lastSwitch = millis();
      }
    }
  }
}

void setup()
{
  Serial.begin(9600);
  pinMode(relay, OUTPUT);

  initWiFi();
  initLittleFS();
  initWebSocket();

  // Web Server Root URL
  server.on("/", HTTP_GET, [](AsyncWebServerRequest *request)
            { request->send(LittleFS, "/index.html", "text/html"); });

  server.serveStatic("/", LittleFS, "/");

  ElegantOTA.begin(&server);

  // Start server
  server.begin();
}

void loop()
{
  if ((millis() - lastTime) > timerDelay)
  {
    String sensorReadings = getSensorReadings();
    notifyClients(sensorReadings);
    regulateRelais();
    lastTime = millis();
  }

  ws.cleanupClients();
  ElegantOTA.loop();
}