export type AttendanceStatus = 'IN' | 'OUT';
export type AttendanceEventType = 'ENTRY' | 'EXIT' | 'UNKNOWN';

export interface StudentRecord {
  id: number;
  rfidUid: string;
  rollNumber: string;
  fullName: string;
  classGrade: number;
  section: string;
  guardianName: string | null;
  guardianPhone: string | null;
  photoDataUrl: string | null;
  currentStatus: AttendanceStatus;
  lastScanAt: string | null;
  createdAt: string;
}

export interface AttendanceLogRecord {
  id: number;
  studentId: number | null;
  rfidUid: string;
  eventType: AttendanceEventType;
  deviceCode: string;
  scanDate: string;
  scannedAt: string;
  studentName: string;
  rollNumber: string;
  classGrade: number | null;
  section: string | null;
  photoDataUrl: string | null;
}

export interface RfidDeviceRecord {
  id: number;
  deviceCode: string;
  locationName: string;
  apiKey: string;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface ScanEventPayload {
  type: 'attendance:scan';
  student: StudentRecord;
  log: AttendanceLogRecord;
}

export interface UnregisteredScanPayload {
  type: 'rfid:unregistered';
  rfidUid: string;
  deviceCode: string;
  scannedAt: string;
  log?: AttendanceLogRecord;
}
