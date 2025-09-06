#include <Arduino.h>
#include <WiFi.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include "LittleFS.h"
#include <ArduinoJson.h>
#include "max6675.h"
#include <ElegantOTA.h>

#include "secrets.h"

// Create AsyncWebServer object on port 80
AsyncWebServer server(80);

// Create a WebSocket object
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

int targetTemp = 300;
int overShoot = 10;
int underShoot = 5;
unsigned long lastSwitch = 0;
unsigned long switchDelay = 60000;
bool autoSwitch = true;

// Get Sensor Readings and return JSON object
String getSensorReadings()
{
  readings["temperature"] = thermocouple.readCelsius();
  if (digitalRead(relay) == HIGH)
  {
    readings["relais"] = 1;
  }
  else
  {
    readings["relais"] = 0;
  }
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
    }
    if (message.startsWith("setTargetTemp"))
    {
      String target = message.substring(15, 18);
      targetTemp = target.toInt();
      Serial.printf("\nTarget temp set to ");
      Serial.print(targetTemp);
      Serial.printf("°C");
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
    if (((millis() - lastSwitch) > switchDelay) && thermocouple.readCelsius() >= (targetTemp - overShoot)) // >= 285°C
    {
      digitalWrite(relay, LOW);
      lastSwitch = millis();
    }
    if (((millis() - lastSwitch) > switchDelay) && thermocouple.readCelsius() < (targetTemp - underShoot)) // < 270°C
    {
      digitalWrite(relay, HIGH);
      lastSwitch = millis();
    }
    lastTime = millis();
  }

  ws.cleanupClients();
  ElegantOTA.loop();
}