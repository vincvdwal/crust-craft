# CrustCraft

This project aims to replace the existing thermostat of a G3 Ferrari Pizza Oven with an ESP‑chip based control system, thereby improving precision, responsiveness, and overall temperature regulation.

Happy baking! 🍕🛠️


## Prerequisites

| **Item**                      | **Description**                   |
|-------                        |-------                            |
| ESP‑32 Dev Board	            | Any WiFi‑enabled chip with at least 4 GPIO pins will do                      |
| MAX6675 K‑Type Thermocouple   | Only a K‑type thermocouple can withstand the temperatures required  |
| 5V Relay Module               | Atleast 10A                       |
| Power Supply	                | 5V / 2A AC-DC adapter             |
| Connecting Wires	            | Silicone heat resistant wiring    |


## Clone the Repository

```
git clone https://github.com/vincvdwal/crust-craft/
cd crust-craft
```
The repo contains the following layout:

## Installing PlatformIO

### VS Code Extension

Open VS Code.

Go to Extensions → Search for “PlatformIO IDE” → Install.
Restart VS Code → PlatformIO panel appears on the left.

## Project Configuration

Open the project:

Platform	Command
VS Code	Double‑click `crust-craft` folder or open > File → Add Folder to Workspace.

Edit platformio.ini (shown below – you can adjust as needed):


```ini
[env:esp32dev]
platform = espressif32
board = esp32dev
framework = arduino

; Optional environment for ESP8266
[env:esp8266]
platform = espressif8266
board = nodemcuv2
framework = arduino
```

## Building the Firmware

Click the “Build” icon (checkboard) in VS Code’s PlatformIO toolbar.
The output will be displayed in the Build Log pane.
Success → you’ll see: Build Done and an `firmware.bin` file under `.pio/build`.

## Uploading to the ESP via VS Code

Press “Upload” (right‑hand arrow icon) in the PlatformIO bar
→ It will compile (again if necessary) and flash to the device.

## Serial Monitor

Click the “Monitor” icon (plug + arrow) or `Ctrl+Alt+M`
 
## Custom Configuration – Wi‑Fi Credentials

The firmware stores your Wi‑Fi SSID & password in `secrets.h`.

Copy the example or create a new file

```bash
cp src/secrets.example.h src/secrets.h
```

And replace the following with your Wi-Fi credentials

```
// Replace with your network credentials
const char *ssid = "WIFI_SSID";
const char *password = "WIFI_PWD";
```

## Installing the filesystem


## Debugging the filesystem


## Building and uploading the filesystem


## Diagram

```mermaid
flowchart TD
    subgraph MCU
        ESP32[ESP32 3.3 VGND]
    end
    subgraph Sensors
        MAX6675[MAX6675 3.3 VGNDCS, SCK, SO]
        Thermo[K‑Type + / -]
    end
    subgraph Relay
        RELAY[5V Relay IN VCC(5V) GND]
    end

    ESP32-->|3.3V|MAX6675
    ESP32-->|GND|MAX6675
    ESP32-->|SCK|MAX6675
    ESP32-->|CS|MAX6675
    ESP32-->|GPIO15|RELAY
    ESP32-->|GND|RELAY

    Thermo-->|+|MAX6675
    Thermo-->|-|MAX6675
```


## Acknowlegdements

This project would not have been possible without the awesome, open‑source libraries below.

|Library |	GitHub URL |	License|
|-------|-------|-------|
adafruit/MAX6675 library|	https://github.com/adafruit/MAX6675-library	 | BSD
bblanchon/ArduinoJson |	https://github.com/bblanchon/ArduinoJson	|MIT
ayushsharma82/ElegantOTA	| https://github.com/ayushsharma82/ElegantOTA |	AGPL-3.0
ESP32Async/AsyncTCP |	https://github.com/ESP32Async/AsyncTCP	| LGPL-3.0
ESP32Async/ESPAsyncWebServer	| https://github.com/ESP32Async/ESPAsyncWebServer |	LGPL-3.0

## ToDo

### Display

In the long run a capacative LCD screen might be used in addition to the WebSocket connection