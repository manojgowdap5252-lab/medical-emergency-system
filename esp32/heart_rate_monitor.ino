/*
  ============================================================
  MedAlert - ESP32 MAX30102 + Buzzer
  Sensor : MAX30102
  Board  : ESP32 DevKit V1

  Sends:
    heartRate
    spO2

  Receives:
    trigger_buzzer
    activate_buzzer
    ambulance_coming
    info_sent_to_hospital

  Buzzer:
    GPIO 2
  ============================================================
*/

#include <Wire.h>
#include "MAX30105.h"
#include "heartRate.h"
#include "spo2_algorithm.h"

#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

// ============================================================
// WIFI
// ============================================================

const char* WIFI_SSID = "vivo 1938";
const char* WIFI_PASSWORD = "Pratyaksha5252";

// ============================================================
// SERVER
// ============================================================

const char* SERVER_HOST =
    "medical-emergency-system.onrender.com";

const int SERVER_PORT = 443;

const char* SERVER_PATH =
    "/socket.io/?EIO=4&transport=websocket";

// ============================================================
// PATIENT
// ============================================================

// Use the SAME patient user ID from your existing ESP32 code.
const char* PATIENT_USER_ID =
    "6aa3c1de11aac7c64376c569";

// ============================================================
// BUZZER
// ============================================================

const int BUZZER_PIN = 2;

// ============================================================
// MAX30102
// ============================================================

MAX30105 sensor;

#define BUFFER_SIZE 100

uint32_t irBuffer[BUFFER_SIZE];
uint32_t redBuffer[BUFFER_SIZE];

int32_t spo2;
int8_t validSpO2;

int32_t heartRate;
int8_t validHeartRate;

// ============================================================
// WEBSOCKET
// ============================================================

WebSocketsClient webSocket;

bool socketIOConnected = false;

unsigned long lastSendTime = 0;

const unsigned long SEND_INTERVAL = 5000;

// ============================================================
// WIFI
// ============================================================

void connectWiFi()
{
  Serial.println();
  Serial.print("Connecting to WiFi: ");
  Serial.println(WIFI_SSID);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while (WiFi.status() != WL_CONNECTED)
  {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.println("WiFi connected!");

  Serial.print("ESP32 IP: ");
  Serial.println(WiFi.localIP());
}

// ============================================================
// SEND SOCKET.IO MESSAGE
// ============================================================

void sendSocketMessage(String eventName, String jsonData)
{
  if (!socketIOConnected)
    return;

  String message =
      "42[\"" +
      eventName +
      "\"," +
      jsonData +
      "]";

  webSocket.sendTXT(message);

  Serial.print("SENT -> ");
  Serial.println(message);
}

// ============================================================
// JOIN PATIENT ROOM
// ============================================================

void joinPatientRoom()
{
  String message =
      "42[\"join_room\",{\"role\":\"customer\",\"userId\":\"" +
      String(PATIENT_USER_ID) +
      "\"}]";

  webSocket.sendTXT(message);

  Serial.println("Joined patient room");
}

// ============================================================
// SEND SENSOR DATA
// ============================================================

void sendSensorData(int hr, int oxygen)
{
  String jsonData =
      "{\"userId\":\"" +
      String(PATIENT_USER_ID) +
      "\",\"heartRate\":" +
      String(hr) +
      ",\"spO2\":" +
      String(oxygen) +
      "}";

  sendSocketMessage("esp32_data", jsonData);
}

// ============================================================
// BUZZER
// ============================================================

void buzzerOn()
{
  digitalWrite(BUZZER_PIN, HIGH);

  Serial.println("🔔 BUZZER ON");
}

void buzzerOff()
{
  digitalWrite(BUZZER_PIN, LOW);

  Serial.println("🔕 BUZZER OFF");
}

void beepBuzzer()
{
  digitalWrite(BUZZER_PIN, HIGH);
  delay(500);
  digitalWrite(BUZZER_PIN, LOW);
}

// ============================================================
// SOCKET EVENT HANDLER
// ============================================================

void webSocketEvent(
    WStype_t type,
    uint8_t* payload,
    size_t length)
{
  switch (type)
  {
    case WStype_DISCONNECTED:

      Serial.println("Socket disconnected");

      socketIOConnected = false;

      break;


    case WStype_CONNECTED:

      Serial.println("Socket connected!");

      socketIOConnected = true;

      // Socket.IO connection
      webSocket.sendTXT("40");

      delay(500);

      joinPatientRoom();

      break;


    case WStype_TEXT:
    {
      String message =
          String((char*)payload);

      Serial.print("SERVER: ");
      Serial.println(message);


      // ------------------------------------------------
      // Ignore sensor_data echo
      // ------------------------------------------------

      if (message.indexOf("\"sensor_data\"") >= 0)
      {
        Serial.println(
            "Ignoring sensor_data event"
        );

        break;
      }


      // ------------------------------------------------
      // BUZZER EVENTS
      // ------------------------------------------------

      if (
          message.indexOf("\"trigger_buzzer\"") >= 0 ||
          message.indexOf("\"activate_buzzer\"") >= 0
         )
      {
        beepBuzzer();
      }


      // ------------------------------------------------
      // AMBULANCE COMING
      // ------------------------------------------------

      if (
          message.indexOf("\"ambulance_coming\"") >= 0
         )
      {
        beepBuzzer();

        Serial.println(
            "🚑 Ambulance is coming!"
        );
      }


      // ------------------------------------------------
      // HOSPITAL INFORMATION
      // ------------------------------------------------

      if (
          message.indexOf("\"info_sent_to_hospital\"") >= 0
         )
      {
        beepBuzzer();

        Serial.println(
            "🏥 Hospital information received!"
        );
      }

      break;
    }


    default:
      break;
  }
}

// ============================================================
// SETUP
// ============================================================

void setup()
{
  Serial.begin(115200);

  delay(1000);

  Serial.println();
  Serial.println("================================");
  Serial.println(" MedAlert ESP32");
  Serial.println(" MAX30102 + Buzzer");
  Serial.println("================================");


  // ------------------------------------------------
  // Buzzer
  // ------------------------------------------------

  pinMode(BUZZER_PIN, OUTPUT);

  digitalWrite(
      BUZZER_PIN,
      LOW
  );


  // ------------------------------------------------
  // I2C
  // ------------------------------------------------

  Wire.begin(21, 22);


  // ------------------------------------------------
  // MAX30102
  // ------------------------------------------------

  Serial.println(
      "Initializing MAX30102..."
  );

  if (
      !sensor.begin(
          Wire,
          I2C_SPEED_FAST
      )
     )
  {
    Serial.println(
        "❌ MAX30102 NOT FOUND!"
    );

    while (1)
    {
      delay(1000);
    }
  }

  Serial.println(
      "✅ MAX30102 detected!"
  );


  sensor.setup(
      60,     // LED brightness
      4,      // sample average
      2,      // Red + IR
      100,    // sample rate
      411,    // pulse width
      4096    // ADC range
  );


  sensor.setPulseAmplitudeRed(
      0x1F
  );

  sensor.setPulseAmplitudeIR(
      0x1F
  );


  // ------------------------------------------------
  // WiFi
  // ------------------------------------------------

  connectWiFi();


  // ------------------------------------------------
  // Secure WebSocket
  // ------------------------------------------------

  Serial.println(
      "Connecting to Render..."
  );

  webSocket.beginSSL(
      SERVER_HOST,
      SERVER_PORT,
      SERVER_PATH
  );

  webSocket.onEvent(
      webSocketEvent
  );

  webSocket.setReconnectInterval(
      5000
  );

  Serial.println(
      "Setup complete."
  );

  Serial.println(
      "Place finger on MAX30102."
  );
}

// ============================================================
// LOOP
// ============================================================

void loop()
{
  webSocket.loop();


  // ==========================================================
  // COLLECT MAX30102 DATA
  // ==========================================================

  for (
      int i = 0;
      i < BUFFER_SIZE;
      i++
      )
  {
    while (!sensor.available())
    {
      sensor.check();
      webSocket.loop();
    }

    redBuffer[i] =
        sensor.getRed();

    irBuffer[i] =
        sensor.getIR();

    sensor.nextSample();
  }


  // ==========================================================
  // CALCULATE HR + SpO2
  // ==========================================================

  maxim_heart_rate_and_oxygen_saturation(
      irBuffer,
      BUFFER_SIZE,
      redBuffer,
      &spo2,
      &validSpO2,
      &heartRate,
      &validHeartRate
  );


  Serial.println();
  Serial.println("------------------------------");


  // ==========================================================
  // VALID HR
  // ==========================================================

  bool validHR =
      validHeartRate &&
      heartRate >= 40 &&
      heartRate <= 120;


  // ==========================================================
  // VALID SPO2
  // ==========================================================

  bool validOxygen =
      validSpO2 &&
      spo2 >= 80 &&
      spo2 <= 100;


  if (validHR)
  {
    Serial.print(
        "❤️ HR: "
    );

    Serial.print(
        heartRate
    );

    Serial.println(
        " BPM"
    );
  }
  else
  {
    Serial.println(
        "❤️ HR: Invalid"
    );
  }


  if (validOxygen)
  {
    Serial.print(
        "🩸 SpO2: "
    );

    Serial.print(
        spo2
    );

    Serial.println(
        " %"
    );
  }
  else
  {
    Serial.println(
        "🩸 SpO2: Invalid"
    );
  }


  // ==========================================================
  // SEND TO SERVER
  // ==========================================================

  unsigned long now =
      millis();


  if (
      now - lastSendTime >=
          SEND_INTERVAL
      &&
      socketIOConnected
      &&
      validHR
      &&
      validOxygen
     )
  {
    lastSendTime =
        now;

    sendSensorData(
        heartRate,
        spo2
    );
  }


  Serial.println(
      "------------------------------"
  );
}