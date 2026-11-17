import crypto from 'node:crypto';
import { and, desc, eq, gte, ilike, lte, or } from 'drizzle-orm';
import { db } from './index.ts';
import { attendanceLogs, rfidDevices, students } from './schema.ts';
import {
  determineNextAttendanceEvent,
  formatScanDate,
  normalizeRfidUid,
  type StudentEnrollmentInput,
} from '../utils/attendanceLogic.ts';
import type {
  AttendanceEventType,
  AttendanceLogRecord,
  AttendanceStatus,
  RfidDeviceRecord,
  StudentRecord,
} from '../types/attendance.ts';

function mapStudentRow(row: typeof students.$inferSelect): StudentRecord {
  return {
    id: row.id,
    rfidUid: row.rfidUid,
    rollNumber: row.rollNumber,
    fullName: row.fullName,
    classGrade: row.classGrade,
    section: row.section,
    guardianName: row.guardianName,
    guardianPhone: row.guardianPhone,
    photoDataUrl: row.photoDataUrl,
    currentStatus: (row.currentStatus === 'IN' ? 'IN' : 'OUT') as AttendanceStatus,
    lastScanAt: row.lastScanAt ? row.lastScanAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapDeviceRow(row: typeof rfidDevices.$inferSelect): RfidDeviceRecord {
  return {
    id: row.id,
    deviceCode: row.deviceCode,
    locationName: row.locationName,
    apiKey: row.apiKey,
    lastSeenAt: row.lastSeenAt ? row.lastSeenAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listStudents(filters?: {
  classGrade?: number;
  search?: string;
}): Promise<StudentRecord[]> {
  try {
    const conditions = [];
    if (filters?.classGrade && filters.classGrade >= 1 && filters.classGrade <= 12) {
      conditions.push(eq(students.classGrade, filters.classGrade));
    }
    if (filters?.search && filters.search.trim()) {
      const pattern = `%${filters.search.trim()}%`;
      conditions.push(
        or(
          ilike(students.fullName, pattern),
          ilike(students.rollNumber, pattern),
          ilike(students.rfidUid, pattern)
        )
      );
    }

    const rows =
      conditions.length > 0
        ? await db
            .select()
            .from(students)
            .where(and(...conditions))
            .orderBy(students.classGrade, students.section, students.rollNumber)
        : await db
            .select()
            .from(students)
            .orderBy(students.classGrade, students.section, students.rollNumber);

    return rows.map(mapStudentRow);
  } catch (error) {
    console.error('Database query failed in listStudents:', error);
    throw new Error('Failed to load enrolled students.', { cause: error });
  }
}

export async function createStudent(
  input: StudentEnrollmentInput & {
    normalizedRfidUid: string;
    normalizedSection: string;
    enrolledByUid: string;
  }
): Promise<StudentRecord> {
  try {
    const existing = await db
      .select({ id: students.id })
      .from(students)
      .where(eq(students.rfidUid, input.normalizedRfidUid))
      .limit(1);

    if (existing.length > 0) {
      throw new Error('DUPLICATE_RFID_UID');
    }

    const [created] = await db
      .insert(students)
      .values({
        rfidUid: input.normalizedRfidUid,
        rollNumber: input.rollNumber.trim(),
        fullName: input.fullName.trim(),
        classGrade: input.classGrade,
        section: input.normalizedSection,
        guardianName: input.guardianName?.trim() || null,
        guardianPhone: input.guardianPhone?.trim() || null,
        photoDataUrl: input.photoDataUrl || null,
        currentStatus: 'OUT',
        enrolledByUid: input.enrolledByUid,
      })
      .returning();

    return mapStudentRow(created);
  } catch (error: any) {
    if (error?.message === 'DUPLICATE_RFID_UID' || error?.code === '23505') {
      throw new Error('This RFID card UID is already assigned to another student.');
    }
    console.error('Database query failed in createStudent:', error);
    throw new Error('Failed to enroll student.', { cause: error });
  }
}

export async function updateStudent(
  studentId: number,
  input: StudentEnrollmentInput & {
    normalizedRfidUid: string;
    normalizedSection: string;
  }
): Promise<StudentRecord | null> {
  try {
    const conflict = await db
      .select({ id: students.id })
      .from(students)
      .where(eq(students.rfidUid, input.normalizedRfidUid))
      .limit(1);

    if (conflict.length > 0 && conflict[0].id !== studentId) {
      throw new Error('DUPLICATE_RFID_UID');
    }

    const [updated] = await db
      .update(students)
      .set({
        rfidUid: input.normalizedRfidUid,
        rollNumber: input.rollNumber.trim(),
        fullName: input.fullName.trim(),
        classGrade: input.classGrade,
        section: input.normalizedSection,
        guardianName: input.guardianName?.trim() || null,
        guardianPhone: input.guardianPhone?.trim() || null,
        photoDataUrl:
          input.photoDataUrl !== undefined ? input.photoDataUrl : undefined,
        updatedAt: new Date(),
      })
      .where(eq(students.id, studentId))
      .returning();

    return updated ? mapStudentRow(updated) : null;
  } catch (error: any) {
    if (error?.message === 'DUPLICATE_RFID_UID' || error?.code === '23505') {
      throw new Error('This RFID card UID is already assigned to another student.');
    }
    console.error('Database query failed in updateStudent:', error);
    throw new Error('Failed to update student profile.', { cause: error });
  }
}

export async function deleteStudent(studentId: number): Promise<boolean> {
  try {
    const deleted = await db
      .delete(students)
      .where(eq(students.id, studentId))
      .returning({ id: students.id });
    return deleted.length > 0;
  } catch (error) {
    console.error('Database query failed in deleteStudent:', error);
    throw new Error('Failed to remove student record.', { cause: error });
  }
}

export async function listAttendanceLogs(filters?: {
  fromDate?: string;
  toDate?: string;
  classGrade?: number;
  eventType?: AttendanceEventType;
  search?: string;
  limit?: number;
}): Promise<AttendanceLogRecord[]> {
  try {
    const conditions = [];
    if (filters?.fromDate) {
      conditions.push(gte(attendanceLogs.scanDate, filters.fromDate));
    }
    if (filters?.toDate) {
      conditions.push(lte(attendanceLogs.scanDate, filters.toDate));
    }
    if (filters?.classGrade && filters.classGrade >= 1 && filters.classGrade <= 12) {
      conditions.push(eq(students.classGrade, filters.classGrade));
    }
    if (
      filters?.eventType === 'ENTRY' ||
      filters?.eventType === 'EXIT' ||
      filters?.eventType === 'UNKNOWN'
    ) {
      conditions.push(eq(attendanceLogs.eventType, filters.eventType));
    }
    if (filters?.search && filters.search.trim()) {
      const pattern = `%${filters.search.trim()}%`;
      conditions.push(
        or(
          ilike(students.fullName, pattern),
          ilike(students.rollNumber, pattern),
          ilike(attendanceLogs.rfidUid, pattern)
        )
      );
    }

    const query = db
      .select({
        id: attendanceLogs.id,
        studentId: attendanceLogs.studentId,
        rfidUid: attendanceLogs.rfidUid,
        eventType: attendanceLogs.eventType,
        deviceCode: attendanceLogs.deviceCode,
        scanDate: attendanceLogs.scanDate,
        scannedAt: attendanceLogs.scannedAt,
        studentName: students.fullName,
        rollNumber: students.rollNumber,
        classGrade: students.classGrade,
        section: students.section,
        photoDataUrl: students.photoDataUrl,
      })
      .from(attendanceLogs)
      .leftJoin(students, eq(attendanceLogs.studentId, students.id));

    const rows =
      conditions.length > 0
        ? await query
            .where(and(...conditions))
            .orderBy(desc(attendanceLogs.scannedAt), desc(attendanceLogs.id))
            .limit(filters?.limit ?? 500)
        : await query
            .orderBy(desc(attendanceLogs.scannedAt), desc(attendanceLogs.id))
            .limit(filters?.limit ?? 500);

    return rows.map((row) => ({
      id: row.id,
      studentId: row.studentId ?? null,
      rfidUid: row.rfidUid,
      eventType: (row.eventType === 'EXIT'
        ? 'EXIT'
        : row.eventType === 'UNKNOWN'
          ? 'UNKNOWN'
          : 'ENTRY') as AttendanceEventType,
      deviceCode: row.deviceCode,
      scanDate: row.scanDate,
      scannedAt: row.scannedAt.toISOString(),
      studentName: row.studentName ?? 'Unknown RFID Card',
      rollNumber: row.rollNumber ?? 'Unregistered',
      classGrade: row.classGrade ?? null,
      section: row.section ?? null,
      photoDataUrl: row.photoDataUrl ?? null,
    }));
  } catch (error) {
    console.error('Database query failed in listAttendanceLogs:', error);
    throw new Error('Failed to load historical attendance logs.', { cause: error });
  }
}

export async function resetAttendanceLogs(): Promise<number> {
  try {
    return await db.transaction(async (tx) => {
      const deleted = await tx
        .delete(attendanceLogs)
        .returning({ id: attendanceLogs.id });
      await tx.update(students).set({
        currentStatus: 'OUT',
        lastScanAt: null,
        updatedAt: new Date(),
      });
      return deleted.length;
    });
  } catch (error) {
    console.error('Database query failed in resetAttendanceLogs:', error);
    throw new Error('Failed to reset attendance logs.', { cause: error });
  }
}

export async function processRfidScan(params: {
  rawRfidUid: string;
  deviceCode: string;
}): Promise<
  | {
      status: 'unregistered';
      rfidUid: string;
      deviceCode: string;
      scannedAt: string;
      log: AttendanceLogRecord;
    }
  | { status: 'debounced'; student: StudentRecord; remainingMs: number }
  | { status: 'logged'; student: StudentRecord; log: AttendanceLogRecord }
> {
  const normalizedUid = normalizeRfidUid(params.rawRfidUid);
  const now = new Date();
  const scanDate = formatScanDate(now);

  try {
    // Update device heartbeat if registered
    await db
      .update(rfidDevices)
      .set({ lastSeenAt: now })
      .where(eq(rfidDevices.deviceCode, params.deviceCode));

    return await db.transaction(async (tx) => {
      const [studentRow] = await tx
        .select()
        .from(students)
        .where(eq(students.rfidUid, normalizedUid))
        .limit(1);

      if (!studentRow) {
        const [insertedUnknown] = await tx
          .insert(attendanceLogs)
          .values({
            studentId: null,
            rfidUid: normalizedUid,
            eventType: 'UNKNOWN',
            deviceCode: params.deviceCode,
            scanDate,
            scannedAt: now,
          })
          .returning();

        const unknownLog: AttendanceLogRecord = {
          id: insertedUnknown.id,
          studentId: null,
          rfidUid: insertedUnknown.rfidUid,
          eventType: 'UNKNOWN',
          deviceCode: insertedUnknown.deviceCode,
          scanDate: insertedUnknown.scanDate,
          scannedAt: insertedUnknown.scannedAt.toISOString(),
          studentName: 'Unknown RFID Card',
          rollNumber: 'Unregistered',
          classGrade: null,
          section: null,
          photoDataUrl: null,
        };

        return {
          status: 'unregistered' as const,
          rfidUid: normalizedUid,
          deviceCode: params.deviceCode,
          scannedAt: insertedUnknown.scannedAt.toISOString(),
          log: unknownLog,
        };
      }

      const currentStatus: AttendanceStatus =
        studentRow.currentStatus === 'IN' ? 'IN' : 'OUT';
      const decision = determineNextAttendanceEvent(
        currentStatus,
        studentRow.lastScanAt,
        now
      );

      if (decision.action === 'DEBOUNCED') {
        return {
          status: 'debounced' as const,
          student: mapStudentRow(studentRow),
          remainingMs: decision.remainingMs,
        };
      }

      const [updatedStudent] = await tx
        .update(students)
        .set({
          currentStatus: decision.nextStatus,
          lastScanAt: now,
          updatedAt: now,
        })
        .where(eq(students.id, studentRow.id))
        .returning();

      const [insertedLog] = await tx
        .insert(attendanceLogs)
        .values({
          studentId: studentRow.id,
          rfidUid: normalizedUid,
          eventType: decision.action,
          deviceCode: params.deviceCode,
          scanDate,
          scannedAt: now,
        })
        .returning();

      const student = mapStudentRow(updatedStudent);
      const log: AttendanceLogRecord = {
        id: insertedLog.id,
        studentId: insertedLog.studentId,
        rfidUid: insertedLog.rfidUid,
        eventType: decision.action,
        deviceCode: insertedLog.deviceCode,
        scanDate: insertedLog.scanDate,
        scannedAt: insertedLog.scannedAt.toISOString(),
        studentName: student.fullName,
        rollNumber: student.rollNumber,
        classGrade: student.classGrade,
        section: student.section,
        photoDataUrl: student.photoDataUrl,
      };

      return {
        status: 'logged' as const,
        student,
        log,
      };
    });
  } catch (error) {
    console.error('Database query failed in processRfidScan:', error);
    throw new Error('Failed to process RFID scan.', { cause: error });
  }
}

export async function listRfidDevices(): Promise<RfidDeviceRecord[]> {
  try {
    const rows = await db
      .select()
      .from(rfidDevices)
      .orderBy(desc(rfidDevices.createdAt));
    return rows.map(mapDeviceRow);
  } catch (error) {
    console.error('Database query failed in listRfidDevices:', error);
    throw new Error('Failed to load ESP8266 devices.', { cause: error });
  }
}

export async function registerRfidDevice(params: {
  deviceCode: string;
  locationName: string;
  createdByUid: string;
}): Promise<RfidDeviceRecord> {
  try {
    const cleanCode = params.deviceCode
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '');
    const apiKey = `esp_${crypto.randomBytes(18).toString('hex')}`;

    const [created] = await db
      .insert(rfidDevices)
      .values({
        deviceCode: cleanCode,
        locationName: params.locationName.trim(),
        apiKey,
        createdByUid: params.createdByUid,
      })
      .returning();

    return mapDeviceRow(created);
  } catch (error: any) {
    if (error?.code === '23505') {
      throw new Error('A reader with that Device Code already exists.');
    }
    console.error('Database query failed in registerRfidDevice:', error);
    throw new Error('Failed to register ESP8266 device.', { cause: error });
  }
}

export async function deleteRfidDevice(deviceId: number): Promise<boolean> {
  try {
    const deleted = await db
      .delete(rfidDevices)
      .where(eq(rfidDevices.id, deviceId))
      .returning({ id: rfidDevices.id });
    return deleted.length > 0;
  } catch (error) {
    console.error('Database query failed in deleteRfidDevice:', error);
    throw new Error('Failed to remove ESP8266 device.', { cause: error });
  }
}

export async function verifyDeviceApiKey(
  deviceCode: string,
  apiKey: string
): Promise<string | null> {
  try {
    const cleanCode = deviceCode
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '');

    const rows = cleanCode
      ? await db
          .select({
            deviceCode: rfidDevices.deviceCode,
            apiKey: rfidDevices.apiKey,
          })
          .from(rfidDevices)
          .where(eq(rfidDevices.deviceCode, cleanCode))
          .limit(1)
      : await db
          .select({
            deviceCode: rfidDevices.deviceCode,
            apiKey: rfidDevices.apiKey,
          })
          .from(rfidDevices);

    const candidateKey = Buffer.from(apiKey.trim(), 'utf8');

    for (const device of rows) {
      const storedKey = Buffer.from(device.apiKey, 'utf8');
      if (
        storedKey.length === candidateKey.length &&
        crypto.timingSafeEqual(storedKey, candidateKey)
      ) {
        return device.deviceCode;
      }
    }

    return null;
  } catch (error) {
    console.error('Database query failed in verifyDeviceApiKey:', error);
    throw new Error('Device authentication verification failed.', { cause: error });
  }
}
