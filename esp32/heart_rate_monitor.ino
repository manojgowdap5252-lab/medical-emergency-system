/*
  =============================================================
  MedAlert - ESP32 Heart Rate Monitor
  Sensor : MAX30102
  Board  : ESP32

  Libraries needed (install from Arduino Library Manager):
    1. MAX30105        by SparkFun
    2. WebSockets      by Markus Sattler
    3. ArduinoJson     by Benoit Blanchon

  Wiring:
    MAX30102 VIN  -> ESP32 3.3V
    MAX30102 GND  -> ESP32 GND
    MAX30102 SDA  -> ESP32 GPIO 21
    MAX30102 SCL  -> ESP32 GPIO 22

    Buzzer +      -> ESP32 GPIO 2
    Buzzer -      -> ESP32 GND
  =============================================================
*/

#include <Wire.h>
#include "MAX30100.h"
#include "heartRate.h"
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

// =============================================================
// WIFI - CHANGE THESE
// =============================================================

const char* WIFI_SSID     = "vivo 1938";
const char* WIFI_PASSWORD = "Pratyaksha5252";

// =============================================================
// SERVER - CHANGE THIS
// =============================================================

// Put your COMPUTER IP here
// To find it: open cmd and type ipconfig
// Look for IPv4 Address under your WiFi adapter
// Example: 192.168.1.105

const char* SERVER_HOST = "10.105.109.195";
const int   SERVER_PORT = 3000;
const char* SERVER_PATH = "/socket.io/?EIO=4&transport=websocket";

// =============================================================
// PATIENT USER ID - CHANGE THIS
// =============================================================

// Copy the _id from MongoDB for this patient
// You can find it in Admin Panel -> Customers list
// Or from MongoDB Compass
// Example: "686abc123def456789012345"

String PATIENT_USER_ID = "6aa3c1de11aac7c64376c569";

// =============================================================
// BUZZER PIN
// =============================================================

const int BUZZER_PIN = 2;

// =============================================================
// MAX30102
// =============================================================

MAX30105 particleSensor;

const byte RATE_SIZE = 4;
byte  rates[RATE_SIZE];
byte  rateSpot    = 0;
long  lastBeat    = 0;
float beatsPerMinute = 0;
int   beatAvg     = 0;
int   spO2Value   = 98; // Placeholder

// =============================================================
// WEBSOCKET
// =============================================================

WebSocketsClient webSocket;
bool transportConnected = false;
bool socketIOConnected  = false;

// =============================================================
// TIMING
// =============================================================

unsigned long lastSendTime    = 0;
const unsigned long SEND_INTERVAL = 2000;

// FIX: This prevents serial spam on no-finger detection
unsigned long lastNoFingerPrint = 0;
const unsigned long NO_FINGER_PRINT_INTERVAL = 3000;

// =============================================================
// BUZZER STATE
// =============================================================

bool          buzzerActive    = false;
unsigned long buzzerStartTime = 0;
unsigned long buzzerDuration  = 0;

// =============================================================
// SETUP
// =============================================================

void setup() {

    Serial.begin(115200);
    delay(1000);

    Serial.println();
    Serial.println("================================");
    Serial.println("       MedAlert ESP32");
    Serial.println("================================");

    // ---- Buzzer ----
    pinMode(BUZZER_PIN, OUTPUT);
    digitalWrite(BUZZER_PIN, LOW);

    // Startup beep to confirm buzzer works
    digitalWrite(BUZZER_PIN, HIGH);
    delay(100);
    digitalWrite(BUZZER_PIN, LOW);

    // ---- I2C ----
    Wire.begin();

    // ---- MAX30102 ----
    Serial.println("Starting MAX30102...");

    if (!particleSensor.begin(Wire, I2C_SPEED_FAST)) {

        Serial.println("ERROR: MAX30102 not found!");
        Serial.println("Check: SDA=GPIO21, SCL=GPIO22, VCC=3.3V");

        // Rapid beep to show sensor error
        while (1) {
            digitalWrite(BUZZER_PIN, HIGH);
            delay(100);
            digitalWrite(BUZZER_PIN, LOW);
            delay(100);
        }
    }

    Serial.println("MAX30102 detected!");

    // Sensor settings
    particleSensor.setup();
    particleSensor.setPulseAmplitudeRed(0x0A);
    particleSensor.setPulseAmplitudeGreen(0);

    // ---- WiFi ----
    connectWiFi();

    // ---- WebSocket ----
    Serial.println();
    Serial.print("Connecting to server: ");
    Serial.print(SERVER_HOST);
    Serial.print(":");
    Serial.println(SERVER_PORT);

    webSocket.begin(SERVER_HOST, SERVER_PORT, SERVER_PATH);
    webSocket.onEvent(webSocketEvent);
    webSocket.setReconnectInterval(3000);

    Serial.println("Setup complete. Place finger on sensor.");
    Serial.println();
}

// =============================================================
// LOOP
// =============================================================

void loop() {

    // Always call this to maintain WebSocket
    webSocket.loop();

    // Handle buzzer pattern
    handleBuzzer();

    // Read sensor
    long irValue = particleSensor.getIR();

    // ---- Heartbeat detected ----
    if (checkForBeat(irValue)) {

        long delta = millis() - lastBeat;
        lastBeat = millis();

        if (delta > 0) {

            beatsPerMinute = 60.0 / (delta / 1000.0);

            if (beatsPerMinute < 255 && beatsPerMinute > 20) {

                rates[rateSpot++] = (byte)beatsPerMinute;
                rateSpot %= RATE_SIZE;

                beatAvg = 0;
                for (byte x = 0; x < RATE_SIZE; x++) {
                    beatAvg += rates[x];
                }
                beatAvg /= RATE_SIZE;

                Serial.print("HR: ");
                Serial.print(beatsPerMinute, 1);
                Serial.print(" BPM | Avg: ");
                Serial.print(beatAvg);
                Serial.println(" BPM");
            }
        }
    }

    // ---- No finger on sensor ----
    if (irValue < 50000) {

        beatAvg = 0;

        // FIX: Only print every 3 seconds instead of every loop
        unsigned long now = millis();
        if (now - lastNoFingerPrint >= NO_FINGER_PRINT_INTERVAL) {
            lastNoFingerPrint = now;
            Serial.println("No finger detected - place finger on sensor");
        }
    }

    // ---- Send data to server ----
    unsigned long now = millis();

    if (
        now - lastSendTime >= SEND_INTERVAL &&
        socketIOConnected &&
        beatAvg > 0
    ) {
        lastSendTime = now;
        sendSensorData(beatAvg, spO2Value);
    }
}

// =============================================================
// WIFI CONNECTION
// =============================================================

void connectWiFi() {

    Serial.println();
    Serial.print("Connecting to WiFi: ");
    Serial.println(WIFI_SSID);

    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    int attempts = 0;

    while (WiFi.status() != WL_CONNECTED && attempts < 40) {
        delay(500);
        Serial.print(".");
        attempts++;
    }

    Serial.println();

    if (WiFi.status() == WL_CONNECTED) {

        Serial.println("WiFi connected!");
        Serial.print("ESP32 IP: ");
        Serial.println(WiFi.localIP());
        Serial.print("Signal: ");
        Serial.print(WiFi.RSSI());
        Serial.println(" dBm");

    } else {

        Serial.println("WiFi FAILED - check SSID and password");
        Serial.println("Continuing without WiFi...");

    }
}

// =============================================================
// SEND SENSOR DATA
// =============================================================

void sendSensorData(int heartRate, int spO2) {

    if (!socketIOConnected) {
        return;
    }

    // Build JSON
    StaticJsonDocument<256> doc;
    doc["userId"]    = PATIENT_USER_ID;
    doc["heartRate"] = heartRate;
    doc["spO2"]      = spO2;

    String jsonData;
    serializeJson(doc, jsonData);

    // Socket.IO event format: 42["event_name", {...}]
    String message = "42[\"esp32_data\"," + jsonData + "]";

    webSocket.sendTXT(message);

    Serial.print("SENT -> HR: ");
    Serial.print(heartRate);
    Serial.print(" BPM | SpO2: ");
    Serial.print(spO2);
    Serial.println("%");
}

// =============================================================
// WEBSOCKET EVENTS
// =============================================================

void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {

    switch (type) {

        // ---- Physical connection established ----
        case WStype_CONNECTED:
            Serial.println();
            Serial.println("WebSocket transport connected!");
            transportConnected = true;
            socketIOConnected  = false;
            break;

        // ---- Disconnected ----
        case WStype_DISCONNECTED:
            Serial.println();
            Serial.println("WebSocket disconnected. Reconnecting...");
            transportConnected = false;
            socketIOConnected  = false;
            break;

        // ---- Text message received ----
        case WStype_TEXT: {

            String msg = String((char*)payload);

            Serial.print("SERVER -> ");
            Serial.println(msg);

            // Engine.IO handshake
            // Server sends: 0{"sid":"..."}
            // We respond:   40
            if (msg.startsWith("0")) {
                Serial.println("Engine.IO open received. Sending Socket.IO connect...");
                webSocket.sendTXT("40");
                return;
            }

            // Socket.IO connected confirmation
            // Server sends: 40 or 40{...}
            if (msg == "40" || msg.startsWith("40{")) {
                Serial.println();
                Serial.println("==============================");
                Serial.println("  Socket.IO CONNECTED!");
                Serial.println("==============================");
                socketIOConnected = true;
                joinPatientRoom();
                return;
            }

            // Engine.IO ping -> respond with pong
            if (msg == "2") {
                webSocket.sendTXT("3");
                return;
            }

            // Socket.IO pong (ignore)
            if (msg == "3") {
                return;
            }

            // Socket.IO event
            if (msg.startsWith("42")) {
                handleSocketIOEvent(msg);
            }

            break;
        }

        // ---- Error ----
        case WStype_ERROR:
            Serial.println("WebSocket ERROR!");
            socketIOConnected = false;
            break;

        default:
            break;
    }
}

// =============================================================
// JOIN PATIENT ROOM
// =============================================================

void joinPatientRoom() {

    String message =
        "42[\"join_room\",{"
        "\"role\":\"customer\","
        "\"userId\":\"" + PATIENT_USER_ID + "\""
        "}]";

    webSocket.sendTXT(message);

    Serial.print("Joined patient room for user: ");
    Serial.println(PATIENT_USER_ID);
}

// =============================================================
// HANDLE SOCKET.IO EVENTS FROM SERVER
// =============================================================

void handleSocketIOEvent(String msg) {

    Serial.print("Event received: ");
    Serial.println(msg);

    // ---- trigger_buzzer (from ambulance pressing arrived) ----
    if (msg.indexOf("trigger_buzzer") >= 0) {

        Serial.println(">> trigger_buzzer event!");

        int duration = extractDuration(msg);
        activateBuzzer(duration);
        return;
    }

    // FIX: Added activate_buzzer handler
    // This is sent from patient dashboard JS when
    // socket.emit('activate_buzzer', ...) is called
    if (msg.indexOf("activate_buzzer") >= 0) {

        Serial.println(">> activate_buzzer event!");

        int duration = extractDuration(msg);
        activateBuzzer(duration);
        return;
    }
}

// =============================================================
// EXTRACT DURATION FROM JSON IN MESSAGE
// Helper used by both buzzer events
// =============================================================

int extractDuration(String msg) {

    int dataStart = msg.indexOf('{');

    if (dataStart < 0) {
        return 10000; // Default 10 seconds
    }

    int dataEnd = msg.lastIndexOf('}');

    if (dataEnd < dataStart) {
        return 10000;
    }

    String jsonPart = msg.substring(dataStart, dataEnd + 1);

    StaticJsonDocument<200> doc;
    DeserializationError error = deserializeJson(doc, jsonPart);

    if (error) {
        Serial.print("JSON parse error: ");
        Serial.println(error.c_str());
        return 10000;
    }

    int duration = doc["duration"] | 10000;

    Serial.print("Buzzer duration: ");
    Serial.print(duration);
    Serial.println(" ms");

    return duration;
}

// =============================================================
// ACTIVATE BUZZER
// =============================================================

void activateBuzzer(int durationMs) {

    Serial.print("BUZZER ON for ");
    Serial.print(durationMs);
    Serial.println(" ms");

    buzzerActive    = true;
    buzzerStartTime = millis();
    buzzerDuration  = (unsigned long)durationMs;

    // Confirm to server that buzzer was triggered
    if (socketIOConnected) {

        String message =
            "42[\"buzzer_triggered\","
            "{\"userId\":\"" + PATIENT_USER_ID + "\"}"
            "]";

        webSocket.sendTXT(message);
    }
}

// =============================================================
// HANDLE BUZZER PATTERN
// ON 500ms -> OFF 200ms -> repeat until duration ends
// =============================================================

void handleBuzzer() {

    if (!buzzerActive) {
        digitalWrite(BUZZER_PIN, LOW);
        return;
    }

    unsigned long elapsed = millis() - buzzerStartTime;

    if (elapsed < buzzerDuration) {

        // Beep pattern: 500ms on, 200ms off
        unsigned long cycle = elapsed % 700;

        if (cycle < 500) {
            digitalWrite(BUZZER_PIN, HIGH);
        } else {
            digitalWrite(BUZZER_PIN, LOW);
        }

    } else {

        // Duration finished
        digitalWrite(BUZZER_PIN, LOW);
        buzzerActive = false;

        Serial.println("BUZZER OFF - finished");
    }
}