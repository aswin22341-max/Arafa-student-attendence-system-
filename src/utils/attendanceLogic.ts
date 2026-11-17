import type { AttendanceEventType, AttendanceStatus } from '../types/attendance.ts';

export const MIN_CLASS_GRADE = 1;
export const MAX_CLASS_GRADE = 12;
export const DEFAULT_DEBOUNCE_MS = 3000;
export const MAX_PHOTO_DATA_URL_LENGTH = 550_000; // ~400KB binary image in base64

/**
 * Normalizes an RFID tag UID (e.g., "a1:b2:c3:d4", "A1 B2 C3 D4", "a1-b2-c3-d4")
 * into a canonical uppercase alphanumeric string ("A1B2C3D4").
 */
export function normalizeRfidUid(raw: string): string {
  return raw.trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

export function formatRfidUidDisplay(normalizedUid: string): string {
  const clean = normalizeRfidUid(normalizedUid);
  if (clean.length < 4 || clean.length % 2 !== 0) {
    return clean;
  }
  return clean.match(/.{1,2}/g)?.join(':') ?? clean;
}

export interface StudentEnrollmentInput {
  rfidUid: string;
  rollNumber: string;
  fullName: string;
  classGrade: number;
  section?: string;
  guardianName?: string | null;
  guardianPhone?: string | null;
  photoDataUrl?: string | null;
}

export function validateStudentEnrollment(input: StudentEnrollmentInput): {
  valid: boolean;
  errors: Record<string, string>;
  normalizedRfidUid: string;
  normalizedSection: string;
} {
  const errors: Record<string, string> = {};
  const normalizedRfidUid = normalizeRfidUid(input.rfidUid || '');
  const normalizedSection = (input.section || 'A').trim().toUpperCase();

  if (!normalizedRfidUid || normalizedRfidUid.length < 4 || normalizedRfidUid.length > 32) {
    errors.rfidUid = 'RFID UID must be 4 to 32 hexadecimal/alphanumeric characters.';
  } else if (!/^[A-F0-9]+$/i.test(normalizedRfidUid)) {
    errors.rfidUid = 'RFID UID must contain only hexadecimal characters (0-9, A-F).';
  }

  const fullName = (input.fullName || '').trim();
  if (fullName.length < 2 || fullName.length > 100) {
    errors.fullName = 'Student full name must be between 2 and 100 characters.';
  }

  const rollNumber = (input.rollNumber || '').trim();
  if (!rollNumber || rollNumber.length > 30) {
    errors.rollNumber = 'Roll number is required (max 30 characters).';
  }

  const grade = Number(input.classGrade);
  if (!Number.isInteger(grade) || grade < MIN_CLASS_GRADE || grade > MAX_CLASS_GRADE) {
    errors.classGrade = 'Class must be an integer between Class 1 and Class 12.';
  }

  if (!normalizedSection || !/^[A-Z0-9]{1,4}$/.test(normalizedSection)) {
    errors.section = 'Section must be 1 to 4 alphanumeric characters (e.g., A, B).';
  }

  if (input.photoDataUrl) {
    if (!input.photoDataUrl.startsWith('data:image/')) {
      errors.photoDataUrl = 'Student photo must be a valid image file.';
    } else if (input.photoDataUrl.length > MAX_PHOTO_DATA_URL_LENGTH) {
      errors.photoDataUrl = 'Student photo exceeds the 400KB size limit.';
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    normalizedRfidUid,
    normalizedSection,
  };
}

/**
 * Determines the next ENTRY/EXIT event for an RFID tap with anti-passback debounce.
 */
export function determineNextAttendanceEvent(
  currentStatus: AttendanceStatus,
  lastScanAt: Date | null,
  now: Date,
  debounceMs: number = DEFAULT_DEBOUNCE_MS
):
  | { action: 'DEBOUNCED'; nextStatus: AttendanceStatus; remainingMs: number }
  | { action: AttendanceEventType; nextStatus: AttendanceStatus } {
  if (lastScanAt) {
    const elapsed = now.getTime() - lastScanAt.getTime();
    if (elapsed >= 0 && elapsed < debounceMs) {
      return {
        action: 'DEBOUNCED',
        nextStatus: currentStatus,
        remainingMs: debounceMs - elapsed,
      };
    }
  }

  if (currentStatus === 'OUT') {
    return { action: 'ENTRY', nextStatus: 'IN' };
  }
  return { action: 'EXIT', nextStatus: 'OUT' };
}

export function formatScanDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export interface CsvAttendanceRow {
  scanDate: string;
  scannedAt: string;
  eventType: AttendanceEventType;
  studentName: string;
  rollNumber: string;
  classGrade: number | null;
  section: string | null;
  rfidUid: string;
  deviceCode: string;
}

function escapeCsvCell(value: string | number): string {
  const str = String(value ?? '');
  // Guard against CSV formula injection in Excel/Sheets
  const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function generateAttendanceCsv(rows: CsvAttendanceRow[]): string {
  const headers = [
    'Date',
    'Timestamp (ISO)',
    'Local Time',
    'Event',
    'Student Name',
    'Roll Number',
    'Class',
    'Section',
    'RFID UID',
    'Gate Reader',
  ];

  const lines = [headers.map(escapeCsvCell).join(',')];

  for (const row of rows) {
    const dt = new Date(row.scannedAt);
    const localTime = Number.isNaN(dt.getTime())
      ? row.scannedAt
      : dt.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        });

    lines.push(
      [
        row.scanDate,
        row.scannedAt,
        localTime,
        row.eventType,
        row.studentName,
        row.rollNumber,
        row.classGrade !== null ? `Class ${row.classGrade}` : 'Unregistered',
        row.section || '—',
        formatRfidUidDisplay(row.rfidUid),
        row.deviceCode,
      ]
        .map(escapeCsvCell)
        .join(',')
    );
  }

  return lines.join('\r\n');
}
