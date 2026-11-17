import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeRfidUid,
  formatRfidUidDisplay,
  validateStudentEnrollment,
  determineNextAttendanceEvent,
  generateAttendanceCsv,
  formatScanDate,
} from './attendanceLogic.ts';

test('normalizeRfidUid strips separators and uppercases hex', () => {
  assert.equal(normalizeRfidUid('a1:b2:c3:d4'), 'A1B2C3D4');
  assert.equal(normalizeRfidUid(' 04 8a 1f 92 '), '048A1F92');
  assert.equal(normalizeRfidUid('de-ad-be-ef'), 'DEADBEEF');
  assert.equal(formatRfidUidDisplay('A1B2C3D4'), 'A1:B2:C3:D4');
});

test('validateStudentEnrollment enforces Class 1 to 12 and valid RFID UID', () => {
  const valid = validateStudentEnrollment({
    rfidUid: 'a1:b2:c3:d4',
    rollNumber: '1204',
    fullName: 'Aarav Sharma',
    classGrade: 10,
    section: 'b',
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.normalizedRfidUid, 'A1B2C3D4');
  assert.equal(valid.normalizedSection, 'B');

  const invalidGradeLow = validateStudentEnrollment({
    rfidUid: 'A1B2C3D4',
    rollNumber: '101',
    fullName: 'Test Student',
    classGrade: 0,
  });
  assert.equal(invalidGradeLow.valid, false);
  assert.ok(invalidGradeLow.errors.classGrade);

  const invalidGradeHigh = validateStudentEnrollment({
    rfidUid: 'A1B2C3D4',
    rollNumber: '101',
    fullName: 'Test Student',
    classGrade: 13,
  });
  assert.equal(invalidGradeHigh.valid, false);
  assert.ok(invalidGradeHigh.errors.classGrade);

  const invalidUid = validateStudentEnrollment({
    rfidUid: 'ZZZ',
    rollNumber: '101',
    fullName: 'Test Student',
    classGrade: 5,
  });
  assert.equal(invalidUid.valid, false);
  assert.ok(invalidUid.errors.rfidUid);
});

test('determineNextAttendanceEvent toggles OUT->ENTRY and IN->EXIT with debounce', () => {
  const t0 = new Date('2026-11-17T08:00:00.000Z');
  const firstEntry = determineNextAttendanceEvent('OUT', null, t0);
  assert.equal(firstEntry.action, 'ENTRY');
  assert.equal(firstEntry.nextStatus, 'IN');

  // Within 5s debounce window
  const tTooFast = new Date('2026-11-17T08:00:02.000Z');
  const debounced = determineNextAttendanceEvent('IN', t0, tTooFast, 5000);
  assert.equal(debounced.action, 'DEBOUNCED');
  assert.equal(debounced.nextStatus, 'IN');

  // After debounce window -> EXIT
  const tExit = new Date('2026-11-17T08:05:00.000Z');
  const exitResult = determineNextAttendanceEvent('IN', t0, tExit, 5000);
  assert.equal(exitResult.action, 'EXIT');
  assert.equal(exitResult.nextStatus, 'OUT');
});

test('generateAttendanceCsv properly formats, escapes quotes, and blocks CSV formula injection', () => {
  const csv = generateAttendanceCsv([
    {
      scanDate: '2026-11-17',
      scannedAt: '2026-11-17T08:30:00.000Z',
      eventType: 'ENTRY',
      studentName: 'Meera, "K"',
      rollNumber: '=CMD()',
      classGrade: 7,
      section: 'A',
      rfidUid: 'A1B2C3D4',
      deviceCode: 'GATE-ESP8266-01',
    },
  ]);

  const lines = csv.split('\r\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^Date,Timestamp \(ISO\),Local Time,Event,Student Name/);
  assert.ok(lines[1].includes('"Meera, ""K"""'));
  assert.ok(lines[1].includes("'=CMD()"));
  assert.ok(lines[1].includes('Class 7'));
  assert.ok(lines[1].includes('A1:B2:C3:D4'));
});

test('generateAttendanceCsv handles unregistered UNKNOWN card rows cleanly', () => {
  const csv = generateAttendanceCsv([
    {
      scanDate: '2026-11-17',
      scannedAt: '2026-11-17T09:15:00.000Z',
      eventType: 'UNKNOWN',
      studentName: 'Unknown RFID Card',
      rollNumber: '—',
      classGrade: null,
      section: null,
      rfidUid: 'B7572707',
      deviceCode: 'GATE-ESP8266-01',
    },
  ]);

  const lines = csv.split('\r\n');
  assert.equal(lines.length, 2);
  assert.ok(lines[1].includes(',UNKNOWN,Unknown RFID Card,—,Unregistered,—,B7:57:27:07,GATE-ESP8266-01'));
});

test('formatScanDate formats YYYY-MM-DD consistently', () => {
  const d = new Date(2026, 10, 5); // Nov 5, 2026
  assert.equal(formatScanDate(d), '2026-11-05');
});
