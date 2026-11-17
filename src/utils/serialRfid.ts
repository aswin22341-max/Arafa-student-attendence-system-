import { normalizeRfidUid } from './attendanceLogic.ts';

/**
 * Extracts a valid hexadecimal RFID UID from an ESP8266 serial monitor line.
 * Supports:
 *  - "UID:9C770007"
 *  - "Scanned RFID UID: 9C:77:00:07"
 *  - "Card UID: 9C 77 00 07" (standard MFRC522 DumpInfo format)
 *  - Bare hex UID lines like "9C770007" or "9C:77:00:07"
 */
export function parseRfidUidFromSerialLine(line: string): string | null {
  const trimmed = (line || '').trim();
  if (!trimmed) return null;

  // Ignore status / HTTP / diagnostic lines that happen to contain hex-like words
  if (
    /^HTTP\s+/i.test(trimmed) ||
    /^Connected/i.test(trimmed) ||
    /^WiFi/i.test(trimmed) ||
    /^Firmware Version/i.test(trimmed) ||
    /^MFRC522/i.test(trimmed) ||
    /^ERROR:/i.test(trimmed)
  ) {
    return null;
  }

  const labeledMatch = trimmed.match(
    /(?:Scanned\s+RFID\s+UID|Card\s+UID|RFID\s+UID|UID)\s*[:=]\s*([0-9A-Fa-f:\-\s]{4,48})/i
  );
  if (labeledMatch) {
    const normalized = normalizeRfidUid(labeledMatch[1]);
    if (
      normalized.length >= 4 &&
      normalized.length <= 32 &&
      /^[A-F0-9]+$/.test(normalized)
    ) {
      return normalized;
    }
    return null;
  }

  // Fallback for bare UID lines (e.g. "9C770007" or "9C:77:00:07" or "9C 77 00 07")
  if (/^[0-9A-Fa-f]{2}(?:[:\-\s]?[0-9A-Fa-f]{2}){1,15}$/.test(trimmed)) {
    const normalized = normalizeRfidUid(trimmed);
    if (normalized.length >= 4 && normalized.length <= 32) {
      return normalized;
    }
  }

  return null;
}

export function buildSharedAppOrigin(currentOrigin: string): {
  isDevPreview: boolean;
  suggestedPublicOrigin: string;
} {
  try {
    const url = new URL(currentOrigin);
    if (url.hostname.startsWith('ais-dev-')) {
      url.hostname = url.hostname.replace(/^ais-dev-/, 'ais-pre-');
      return {
        isDevPreview: true,
        suggestedPublicOrigin: url.origin,
      };
    }
    return {
      isDevPreview: false,
      suggestedPublicOrigin: url.origin,
    };
  } catch {
    return {
      isDevPreview: false,
      suggestedPublicOrigin: currentOrigin,
    };
  }
}
