import { relations } from 'drizzle-orm';
import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const adminAccounts = pgTable('admin_accounts', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  fullName: text('full_name').notNull().default('School Administrator'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const students = pgTable(
  'students',
  {
    id: serial('id').primaryKey(),
    rfidUid: text('rfid_uid').notNull(),
    rollNumber: text('roll_number').notNull(),
    fullName: text('full_name').notNull(),
    classGrade: integer('class_grade').notNull(),
    section: text('section').notNull().default('A'),
    guardianName: text('guardian_name'),
    guardianPhone: text('guardian_phone'),
    photoDataUrl: text('photo_data_url'),
    currentStatus: text('current_status').notNull().default('OUT'),
    lastScanAt: timestamp('last_scan_at'),
    enrolledByUid: text('enrolled_by_uid').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('students_rfid_uid_idx').on(table.rfidUid),
  ]
);

export const attendanceLogs = pgTable('attendance_logs', {
  id: serial('id').primaryKey(),
  studentId: integer('student_id').references(() => students.id, {
    onDelete: 'cascade',
  }),
  rfidUid: text('rfid_uid').notNull(),
  eventType: text('event_type').notNull(), // 'ENTRY' | 'EXIT' | 'UNKNOWN'
  deviceCode: text('device_code').notNull().default('GATE-ESP8266-01'),
  scanDate: text('scan_date').notNull(), // YYYY-MM-DD
  scannedAt: timestamp('scanned_at').defaultNow().notNull(),
});

export const rfidDevices = pgTable(
  'rfid_devices',
  {
    id: serial('id').primaryKey(),
    deviceCode: text('device_code').notNull(),
    locationName: text('location_name').notNull(),
    apiKey: text('api_key').notNull(),
    lastSeenAt: timestamp('last_seen_at'),
    createdByUid: text('created_by_uid').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('rfid_devices_code_idx').on(table.deviceCode),
  ]
);

export const studentsRelations = relations(students, ({ many }) => ({
  logs: many(attendanceLogs),
}));

export const attendanceLogsRelations = relations(attendanceLogs, ({ one }) => ({
  student: one(students, {
    fields: [attendanceLogs.studentId],
    references: [students.id],
  }),
}));
