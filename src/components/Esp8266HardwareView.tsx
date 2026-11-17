import React, { useState } from 'react';
import {
  Check,
  Copy,
  Cpu,
  ExternalLink,
  Plus,
  Play,
  Trash2,
  Usb,
} from 'lucide-react';
import type { RfidDeviceRecord, StudentRecord } from '../types/attendance.ts';
import { formatRfidUidDisplay } from '../utils/attendanceLogic.ts';

interface Esp8266HardwareViewProps {
  devices: RfidDeviceRecord[];
  students: StudentRecord[];
  onCreateDevice: (payload: {
    deviceCode: string;
    locationName: string;
  }) => Promise<RfidDeviceRecord>;
  onDeleteDevice: (id: number) => Promise<void>;
  onSimulateScan: (rfidUid: string, deviceCode: string) => Promise<any>;
  usbSupported: boolean;
  usbConnected: boolean;
  usbError: string | null;
  usbSerialLogs: string[];
  onConnectUsb: (deviceCode: string) => Promise<void>;
  onDisconnectUsb: () => Promise<void>;
}

function buildUsbSerialSketch(deviceCode: string): string {
  return `#include <SPI.h>
#include <MFRC522.h>

// Arafa English School — ESP8266 + MFRC522 USB Serial Sketch (115200 baud)
// Device Code: ${deviceCode}
//
// MFRC522 Wiring (NodeMCU ESP8266):
//   3.3V -> 3V3 (NEVER 5V)
//   GND  -> GND
//   SCK  -> D5 (GPIO14)
//   MOSI -> D7 (GPIO13)
//   MISO -> D6 (GPIO12)
//   SDA  -> D2 (GPIO4)   [auto-detect also checks D8, D4]
//   RST  -> D1 (GPIO5)   [auto-detect also checks D3]

struct PinPair { byte ss; byte rst; const char* label; };
const PinPair WIRING_OPTIONS[] = {
  { 4,  5, "SS=D2(GPIO4),  RST=D1(GPIO5)" },
  { 15, 0, "SS=D8(GPIO15), RST=D3(GPIO0)" },
  { 2,  0, "SS=D4(GPIO2),  RST=D3(GPIO0)" },
  { 15, 5, "SS=D8(GPIO15), RST=D1(GPIO5)" }
};

MFRC522 rfid;
bool rfidReady = false;
String lastReadUid = "";
unsigned long lastReadAtMs = 0;
const unsigned long SAME_CARD_COOLDOWN_MS = 1000;

bool detectAndInitMfrc522() {
  for (unsigned int i = 0; i < sizeof(WIRING_OPTIONS) / sizeof(WIRING_OPTIONS[0]); i++) {
    rfid.PCD_Init(WIRING_OPTIONS[i].ss, WIRING_OPTIONS[i].rst);
    delay(40);
    byte ver = rfid.PCD_ReadRegister(MFRC522::VersionReg);
    if (ver != 0x00 && ver != 0xFF) {
      rfid.PCD_SetAntennaGain(rfid.RxGain_max);
      Serial.printf("MFRC522 OK [%s] Firmware=0x%02X\\n", WIRING_OPTIONS[i].label, ver);
      return true;
    }
    pinMode(WIRING_OPTIONS[i].ss, INPUT);
  }
  Serial.println("MFRC522 NOT FOUND! Check 3.3V, GND, SCK->D5, MOSI->D7, MISO->D6, SDA->D2, RST->D1");
  return false;
}

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\\n--- Arafa English School Fast USB RFID Reader (${deviceCode}) ---");
  SPI.begin();
  rfidReady = detectAndInitMfrc522();
  Serial.println("USB Serial Reader Ready. Close Arduino Serial Monitor before connecting in browser.");
}

void loop() {
  if (!rfidReady) {
    delay(1500);
    rfidReady = detectAndInitMfrc522();
    return;
  }

  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) {
    delay(5);
    return;
  }

  String uidHex = "";
  uidHex.reserve(16);
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) uidHex += "0";
    uidHex += String(rfid.uid.uidByte[i], HEX);
  }
  uidHex.toUpperCase();

  unsigned long nowMs = millis();
  if (uidHex != lastReadUid || (nowMs - lastReadAtMs) >= SAME_CARD_COOLDOWN_MS) {
    lastReadUid = uidHex;
    lastReadAtMs = nowMs;
    // Sent immediately to the browser Web Serial bridge
    Serial.println("UID:" + uidHex);
    Serial.flush();
  }

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
}`;
}

export function Esp8266HardwareView({
  devices,
  students,
  onCreateDevice,
  onDeleteDevice,
  onSimulateScan,
  usbSupported,
  usbConnected,
  usbError,
  usbSerialLogs,
  onConnectUsb,
  onDisconnectUsb,
}: Esp8266HardwareViewProps) {
  const [deviceCode, setDeviceCode] = useState('GATE-ESP8266-01');
  const [locationName, setLocationName] = useState('Main School Entrance');
  const [creating, setCreating] = useState(false);
  const [deviceError, setDeviceError] = useState<string | null>(null);

  const [selectedDeviceCode, setSelectedDeviceCode] = useState<string>(
    devices[0]?.deviceCode || 'GATE-ESP8266-01'
  );
  const [testUid, setTestUid] = useState('');
  const [simResult, setSimResult] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const isInIframe =
    typeof window !== 'undefined' && window.self !== window.top;

  const activeDevice =
    devices.find((d) => d.deviceCode === selectedDeviceCode) || devices[0];

  const sketchCode = buildUsbSerialSketch(
    activeDevice?.deviceCode || 'GATE-ESP8266-01'
  );

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(key);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Clipboard blocked in restricted context
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeviceError(null);
    setCreating(true);
    try {
      const created = await onCreateDevice({ deviceCode, locationName });
      setSelectedDeviceCode(created.deviceCode);
      setDeviceCode('');
      setLocationName('');
    } catch (err: any) {
      setDeviceError(err?.message || 'Could not register ESP8266 device.');
    } finally {
      setCreating(false);
    }
  };

  const handleRunTestScan = async (uidToTest: string) => {
    if (!uidToTest.trim()) return;
    setSimulating(true);
    setSimResult(null);
    try {
      const res = await onSimulateScan(
        uidToTest,
        activeDevice?.deviceCode || 'GATE-ESP8266-01'
      );
      if (res.status === 'logged') {
        setSimResult(
          `${res.log.eventType} logged for ${res.student.fullName} (Class ${res.student.classGrade}-${res.student.section}).`
        );
      } else if (res.status === 'unregistered') {
        setSimResult(
          `Tag ${formatRfidUidDisplay(res.rfidUid)} is unregistered. You can assign it in the Student Enrollment tab.`
        );
      } else if (res.status === 'debounced') {
        setSimResult(
          `Anti-passback debounce active for ${res.studentName} (${Math.ceil(res.remainingMs / 1000)}s remaining).`
        );
      }
    } catch (err: any) {
      setSimResult(err?.message || 'Test scan failed.');
    } finally {
      setSimulating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          ESP8266 USB Serial Setup
        </h1>
        <p className="text-sm text-slate-500">
          Connect your ESP8266 + MFRC522 reader over USB at 115200 baud to log
          live student entries and exits
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: USB Serial Connection + Gate Reader + Test Pipeline */}
        <div className="lg:col-span-5 space-y-6">
          {/* Direct USB Serial Reader */}
          <section className="bg-white border border-slate-200/85 rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04)] p-5 space-y-3.5">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Usb className="w-4 h-4 text-[#2D72A8]" aria-hidden="true" />
                <span>1. Connect USB Serial Reader</span>
              </h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                Plug your ESP8266 into your computer&apos;s USB port, close
                Arduino IDE Serial Monitor (so Windows unlocks the COM port),
                and click connect below.
              </p>
            </div>

            {isInIframe && (
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                <p className="text-xs text-slate-600">
                  Embedded preview frames block browser USB access. Open this
                  portal in a dedicated Chrome or Edge tab to connect via USB:
                </p>
                <a
                  href={window.location.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium"
                >
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Open Portal in New Tab for USB</span>
                </a>
              </div>
            )}

            {usbError && (
              <div
                role="alert"
                className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700"
              >
                {usbError}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2.5">
              {!usbConnected ? (
                <button
                  type="button"
                  disabled={!usbSupported}
                  onClick={() =>
                    onConnectUsb(activeDevice?.deviceCode || 'GATE-ESP8266-01')
                  }
                  className="px-4 py-2 rounded-lg bg-[#2D72A8] hover:bg-[#235B87] disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer"
                >
                  <Usb className="w-4 h-4" aria-hidden="true" />
                  <span>Connect ESP8266 via USB</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onDisconnectUsb}
                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer"
                >
                  <Usb className="w-4 h-4" aria-hidden="true" />
                  <span>Disconnect USB Reader</span>
                </button>
              )}

              <span className="text-xs font-medium text-slate-600">
                {usbConnected
                  ? 'Listening for RFID cards at 115200 baud...'
                  : usbSupported
                    ? 'Ready (Chrome / Edge)'
                    : 'Use Chrome or Edge for USB mode'}
              </span>
            </div>

            {usbSerialLogs.length > 0 && (
              <div className="bg-slate-950 text-slate-200 rounded-lg p-3 font-sans text-[11px] max-h-36 overflow-y-auto space-y-0.5">
                {usbSerialLogs.map((line, idx) => (
                  <p key={idx} className="truncate">
                    {line}
                  </p>
                ))}
              </div>
            )}
          </section>

          <section className="bg-white border border-slate-200/85 rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04)] p-5 space-y-4">
            <h2 className="text-base font-semibold text-slate-900">
              Gate Reader Label
            </h2>

            {deviceError && (
              <div
                role="alert"
                className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700"
              >
                {deviceError}
              </div>
            )}

            <form onSubmit={handleRegister} className="space-y-3">
              <div className="space-y-1">
                <label
                  htmlFor="device-code"
                  className="block text-xs font-medium text-slate-700"
                >
                  Device Code
                </label>
                <input
                  id="device-code"
                  type="text"
                  value={deviceCode}
                  onChange={(e) => setDeviceCode(e.target.value)}
                  placeholder="GATE-ESP8266-01"
                  required
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-sans uppercase focus:outline-none focus:ring-2 focus:ring-[#2D72A8]"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="device-location"
                  className="block text-xs font-medium text-slate-700"
                >
                  Gate / Location Name
                </label>
                <input
                  id="device-location"
                  type="text"
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                  placeholder="Main School Entrance"
                  required
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#2D72A8]"
                />
              </div>

              <button
                type="submit"
                disabled={creating}
                className="w-full py-2 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-sm font-medium flex items-center justify-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span>{creating ? 'Saving...' : 'Add Gate Reader'}</span>
              </button>
            </form>
          </section>

          <section className="bg-white border border-slate-200/85 rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                Registered Gate Readers ({devices.length})
              </h3>
            </div>
            {devices.length === 0 ? (
              <div className="p-6 text-center space-y-1.5">
                <Cpu
                  className="w-7 h-7 text-slate-300 mx-auto"
                  aria-hidden="true"
                />
                <p className="text-xs font-medium text-slate-700">
                  No gate readers added yet
                </p>
                <p className="text-xs text-slate-500">
                  USB Serial will use GATE-ESP8266-01 by default, or add a
                  named gate above.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {devices.map((dev) => (
                  <div
                    key={dev.id}
                    className={`p-4 flex items-center justify-between gap-2 ${
                      activeDevice?.id === dev.id ? 'bg-[#2D72A8]/5' : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedDeviceCode(dev.deviceCode)}
                      className="text-left cursor-pointer"
                    >
                      <p className="text-sm font-semibold font-sans text-slate-900">
                        {dev.deviceCode}
                      </p>
                      <p className="text-xs text-slate-500">
                        {dev.locationName}
                      </p>
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete reader ${dev.deviceCode}`}
                      onClick={() => onDeleteDevice(dev.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Interactive Endpoint Tester */}
          <section className="bg-white border border-slate-200/85 rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04)] p-5 space-y-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-slate-900">
                3. Test RFID Tap Pipeline
              </h3>
              <p className="text-xs text-slate-500">
                Simulate a card scan to verify real-time photo display,
                ENTRY/EXIT toggling, and Cloud SQL logging.
              </p>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                aria-label="RFID UID to test"
                value={testUid}
                onChange={(e) => setTestUid(e.target.value)}
                placeholder="Enter RFID UID (e.g. 9C770007)"
                className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm font-sans uppercase focus:outline-none focus:ring-2 focus:ring-[#2D72A8]"
              />
              <button
                type="button"
                disabled={simulating || !testUid.trim()}
                onClick={() => handleRunTestScan(testUid)}
                className="px-4 py-2 rounded-lg bg-[#2D72A8] hover:bg-[#235B87] disabled:opacity-50 text-white text-sm font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Send Tap</span>
              </button>
            </div>

            {students.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-slate-600">
                  Quick-tap an enrolled student:
                </p>
                <div className="flex flex-wrap gap-2">
                  {students.slice(0, 6).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => handleRunTestScan(s.rfidUid)}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-[#2D72A8] hover:bg-[#2D72A8]/5 text-xs text-slate-700 cursor-pointer"
                    >
                      {s.fullName} ·{' '}
                      <span className="font-sans">
                        {formatRfidUidDisplay(s.rfidUid)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {simResult && (
              <div
                role="status"
                className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700"
              >
                {simResult}
              </div>
            )}
          </section>
        </div>

        {/* Right: Clean USB Serial ESP8266 Arduino Sketch */}
        <section className="lg:col-span-7 bg-white border border-slate-200/85 rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                2. ESP8266 + MFRC522 Fast USB Serial Sketch (No WiFi Needed)
              </h2>
              <p className="text-xs text-slate-500">
                5ms fast poll with zero delay between different student cards,
                auto-pin detection (D2/D1), and instant USB Serial output at
                115200 baud
              </p>
            </div>

            <button
              type="button"
              onClick={() => copyText('sketch', sketchCode)}
              className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              {copiedId === 'sketch' ? (
                <>
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Sketch Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Copy Arduino Code</span>
                </>
              )}
            </button>
          </div>

          <pre className="p-5 bg-slate-950 text-slate-100 text-xs font-sans leading-relaxed overflow-x-auto max-h-[680px]">
            <code>{sketchCode}</code>
          </pre>
        </section>
      </div>
    </div>
  );
}
