import { useEffect, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CreditCard,
  Radio,
  RotateCcw,
  ShieldAlert,
  UserPlus,
} from 'lucide-react';
import type {
  AttendanceLogRecord,
  StudentRecord,
} from '../types/attendance.ts';
import { formatRfidUidDisplay, formatScanDate } from '../utils/attendanceLogic.ts';
import { StudentAvatar } from './StudentAvatar.tsx';

interface LiveMonitorViewProps {
  students: StudentRecord[];
  logs: AttendanceLogRecord[];
  latestScan: AttendanceLogRecord | null;
  scanNotice?: string | null;
  usbError: string | null;
  loading: boolean;
  onRequestResetLogs: () => void;
  onGoToEnroll: (prefillRfidUid?: string) => void;
  onGoToHardware: () => void;
}

function formatTime(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDateOnly(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatFullDateTime(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function LiveMonitorView({
  students,
  logs,
  latestScan,
  scanNotice = null,
  usbError,
  loading,
  onRequestResetLogs,
  onGoToEnroll,
  onGoToHardware,
}: LiveMonitorViewProps) {
  const [clockNow, setClockNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClockNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const totalEnrolled = students.length;
  const onCampusCount = students.filter((s) => s.currentStatus === 'IN').length;
  const checkedOutCount = totalEnrolled - onCampusCount;
  const attendancePct =
    totalEnrolled > 0 ? Math.round((onCampusCount / totalEnrolled) * 100) : 0;

  const todayIso = formatScanDate(clockNow);
  const todayScansCount = logs.filter((l) => l.scanDate === todayIso).length;

  const gradeSummary = Array.from({ length: 12 }, (_, idx) => {
    const grade = idx + 1;
    const inGrade = students.filter((s) => s.classGrade === grade);
    const present = inGrade.filter((s) => s.currentStatus === 'IN').length;
    return { grade, total: inGrade.length, present };
  });

  const isLatestUnknown = latestScan?.eventType === 'UNKNOWN';

  return (
    <div className="space-y-6">
      {usbError && (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 rounded-xl p-3.5 text-xs text-red-700"
        >
          {usbError}
        </div>
      )}

      {scanNotice && (
        <div
          role="status"
          className="bg-sky-50 border border-sky-200 rounded-xl p-3.5 text-xs font-medium text-sky-900"
        >
          {scanNotice}
        </div>
      )}

      {/* Real-Time Spotlight Card (Focal Anchor) */}
      <section
        aria-label="Latest RFID Scan Spotlight"
        data-testid="live-spotlight"
        className="bg-white border border-slate-200/85 shadow-[0_1px_2px_rgba(15,23,42,0.04)] rounded-xl p-6 sm:p-7"
      >
        {loading ? (
          <div className="animate-pulse flex flex-col sm:flex-row items-center gap-6">
            <div className="w-32 h-32 rounded-xl bg-slate-200 shrink-0" />
            <div className="flex-1 space-y-3 w-full">
              <div className="h-5 bg-slate-200 rounded w-48" />
              <div className="h-8 bg-slate-200 rounded w-72" />
              <div className="h-4 bg-slate-200 rounded w-96" />
            </div>
          </div>
        ) : latestScan && isLatestUnknown ? (
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 flex-1 min-w-0">
              <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center shrink-0">
                <ShieldAlert
                  className="w-12 h-12 sm:w-14 sm:h-14 text-red-600"
                  aria-hidden="true"
                />
              </div>
              <div className="space-y-3 flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-semibold text-red-700">
                    Most Recent Gate Scan · Unregistered Card
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-sans tabular-nums">
                    {formatFullDateTime(latestScan.scannedAt)}
                  </span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                  Unknown RFID Card
                </h2>
                <p className="text-sm text-slate-600">
                  This tag is not assigned to any student in Classes 1–12.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                  <div className="px-3 py-2 rounded-lg bg-slate-50/80 border border-slate-200/75">
                    <p className="text-[11px] font-medium text-slate-500">
                      Date
                    </p>
                    <p className="text-xs font-semibold text-slate-900 tabular-nums mt-0.5">
                      {formatDateOnly(latestScan.scannedAt)}
                    </p>
                  </div>
                  <div className="px-3 py-2 rounded-lg bg-slate-50/80 border border-slate-200/75">
                    <p className="text-[11px] font-medium text-slate-500">
                      Time
                    </p>
                    <p className="text-xs font-semibold text-slate-900 tabular-nums mt-0.5">
                      {formatTime(latestScan.scannedAt)}
                    </p>
                  </div>
                  <div className="px-3 py-2 rounded-lg bg-slate-50/80 border border-slate-200/75">
                    <p className="text-[11px] font-medium text-slate-500">
                      RFID UID
                    </p>
                    <p className="text-xs font-semibold text-slate-900 tabular-nums mt-0.5">
                      {formatRfidUidDisplay(latestScan.rfidUid)}
                    </p>
                  </div>
                  <div className="px-3 py-2 rounded-lg bg-slate-50/80 border border-slate-200/75">
                    <p className="text-[11px] font-medium text-slate-500">
                      Gate Reader
                    </p>
                    <p className="text-xs font-semibold text-slate-900 truncate mt-0.5">
                      {latestScan.deviceCode}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex sm:flex-col items-center sm:items-end gap-2.5 self-stretch sm:self-center justify-between border-t sm:border-t-0 pt-4 sm:pt-0 border-slate-100 shrink-0">
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-800">
                <ShieldAlert
                  className="w-5 h-5 text-red-600"
                  aria-hidden="true"
                />
                <span className="text-sm font-bold tracking-wide">
                  UNKNOWN CARD
                </span>
              </div>
              <button
                type="button"
                onClick={() => onGoToEnroll(latestScan.rfidUid)}
                className="px-3.5 py-2 rounded-lg bg-[#2D72A8] hover:bg-[#235B87] text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
              >
                <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Assign to Student</span>
              </button>
            </div>
          </div>
        ) : latestScan ? (
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 flex-1 min-w-0">
              <StudentAvatar
                name={latestScan.studentName}
                photoDataUrl={latestScan.photoDataUrl}
                sizeClass="w-28 h-28 sm:w-36 sm:h-36 ring-1 ring-slate-200"
                textSizeClass="text-2xl"
              />
              <div className="space-y-3 flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-semibold text-[#2D72A8]">
                    Most Recent Gate Scan
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-sans tabular-nums">
                    {formatFullDateTime(latestScan.scannedAt)}
                  </span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                  {latestScan.studentName}
                </h2>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
                  <span className="font-medium text-slate-900">
                    Class {latestScan.classGrade} · Section {latestScan.section}
                  </span>
                  <span aria-hidden="true" className="text-slate-300">
                    /
                  </span>
                  <span className="tabular-nums">
                    Roll No.{' '}
                    <strong className="font-semibold text-slate-900">
                      {latestScan.rollNumber}
                    </strong>
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                  <div className="px-3 py-2 rounded-lg bg-slate-50/80 border border-slate-200/75">
                    <p className="text-[11px] font-medium text-slate-500">
                      Date
                    </p>
                    <p className="text-xs font-semibold text-slate-900 tabular-nums mt-0.5">
                      {formatDateOnly(latestScan.scannedAt)}
                    </p>
                  </div>
                  <div className="px-3 py-2 rounded-lg bg-slate-50/80 border border-slate-200/75">
                    <p className="text-[11px] font-medium text-slate-500">
                      Time
                    </p>
                    <p className="text-xs font-semibold text-slate-900 tabular-nums mt-0.5">
                      {formatTime(latestScan.scannedAt)}
                    </p>
                  </div>
                  <div className="px-3 py-2 rounded-lg bg-slate-50/80 border border-slate-200/75">
                    <p className="text-[11px] font-medium text-slate-500">
                      RFID UID
                    </p>
                    <p className="text-xs font-semibold text-slate-900 tabular-nums mt-0.5">
                      {formatRfidUidDisplay(latestScan.rfidUid)}
                    </p>
                  </div>
                  <div className="px-3 py-2 rounded-lg bg-slate-50/80 border border-slate-200/75">
                    <p className="text-[11px] font-medium text-slate-500">
                      Gate Reader
                    </p>
                    <p className="text-xs font-semibold text-slate-900 truncate mt-0.5">
                      {latestScan.deviceCode}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex sm:flex-col items-center sm:items-end gap-2 self-stretch sm:self-center justify-between border-t sm:border-t-0 pt-4 sm:pt-0 border-slate-100 shrink-0">
              {latestScan.eventType === 'ENTRY' ? (
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800">
                  <ArrowDownLeft
                    className="w-5 h-5 text-emerald-600"
                    aria-hidden="true"
                  />
                  <span className="text-sm font-bold tracking-wide">
                    ENTRY LOGGED
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
                  <ArrowUpRight
                    className="w-5 h-5 text-amber-600"
                    aria-hidden="true"
                  />
                  <span className="text-sm font-bold tracking-wide">
                    EXIT LOGGED
                  </span>
                </div>
              )}
              <span className="text-xs text-slate-500 font-sans tabular-nums">
                {latestScan.eventType === 'ENTRY'
                  ? 'Status: On Campus'
                  : 'Status: Checked Out'}
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-[#2D72A8] shrink-0">
                  <Radio className="w-6 h-6" aria-hidden="true" />
                </div>
                <div className="space-y-0.5">
                  <h2 className="text-lg font-semibold text-slate-900">
                    {totalEnrolled === 0
                      ? 'Ready to set up Arafa English School RFID Attendance'
                      : 'Waiting for first RFID card scan'}
                  </h2>
                  <p className="text-sm text-slate-500">
                    {totalEnrolled === 0
                      ? 'Follow these three steps to start logging live student entries and exits.'
                      : 'Tap a student RFID card on your connected ESP8266 reader to display their photo and ENTRY/EXIT status.'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => onGoToEnroll()}
                  className="px-4 py-2 rounded-lg bg-[#2D72A8] hover:bg-[#235B87] text-white text-sm font-medium whitespace-nowrap cursor-pointer transition-colors"
                >
                  {totalEnrolled === 0 ? '1. Enroll First Student' : 'Enroll Student'}
                </button>
                <button
                  type="button"
                  onClick={onGoToHardware}
                  className="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium whitespace-nowrap cursor-pointer transition-colors"
                >
                  ESP8266 Setup
                </button>
              </div>
            </div>

            {totalEnrolled === 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-100">
                <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200/80 space-y-1">
                  <p className="text-xs font-semibold text-[#2D72A8]">
                    Step 1 · Enroll Students
                  </p>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Add students in Classes 1–12 with their Roll Number, RFID tag
                    UID, and portrait photo.
                  </p>
                </div>
                <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200/80 space-y-1">
                  <p className="text-xs font-semibold text-[#2D72A8]">
                    Step 2 · Connect ESP8266 via USB
                  </p>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Flash the USB Serial Arduino sketch in ESP8266 Setup and
                    connect your reader at 115200 baud.
                  </p>
                </div>
                <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200/80 space-y-1">
                  <p className="text-xs font-semibold text-[#2D72A8]">
                    Step 3 · Monitor & Export
                  </p>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Student photos and ENTRY/EXIT logs appear here live and
                    export as CSV reports for teachers.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Executive 4-Column KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200/85 shadow-[0_1px_2px_rgba(15,23,42,0.04)] rounded-xl p-5 space-y-1.5">
          <p className="text-xs font-medium text-slate-500">Enrolled Students</p>
          <p className="text-3xl font-bold tracking-tight text-slate-900 font-sans tabular-nums">
            {totalEnrolled}
          </p>
          <p className="text-[11px] text-slate-400">Classes 1–12 directory</p>
        </div>
        <div className="bg-white border border-slate-200/85 shadow-[0_1px_2px_rgba(15,23,42,0.04)] rounded-xl p-5 space-y-1.5">
          <p className="text-xs font-medium text-slate-500">
            Currently On Campus
          </p>
          <p className="text-3xl font-bold tracking-tight text-emerald-700 font-sans tabular-nums">
            {onCampusCount}
          </p>
          <p className="text-[11px] text-slate-400 tabular-nums">
            {attendancePct}% campus occupancy
          </p>
        </div>
        <div className="bg-white border border-slate-200/85 shadow-[0_1px_2px_rgba(15,23,42,0.04)] rounded-xl p-5 space-y-1.5">
          <p className="text-xs font-medium text-slate-500">Checked Out</p>
          <p className="text-3xl font-bold tracking-tight text-slate-700 font-sans tabular-nums">
            {checkedOutCount}
          </p>
          <p className="text-[11px] text-slate-400">Awaiting arrival or departed</p>
        </div>
        <div className="bg-white border border-slate-200/85 shadow-[0_1px_2px_rgba(15,23,42,0.04)] rounded-xl p-5 space-y-1.5">
          <p className="text-xs font-medium text-slate-500">Scans Today</p>
          <p className="text-3xl font-bold tracking-tight text-[#2D72A8] font-sans tabular-nums">
            {todayScansCount}
          </p>
          <p className="text-[11px] text-slate-400">Entries, exits &amp; alerts</p>
        </div>
      </div>

      {/* Two-Column Lower Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Live Activity Stream */}
        <section className="lg:col-span-7 bg-white border border-slate-200/85 shadow-[0_1px_2px_rgba(15,23,42,0.04)] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200/80 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Recent Gate Scans
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Live stream of verified entries, exits, and unregistered cards
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500 tabular-nums">
                {logs.length} recorded
              </span>
              <button
                type="button"
                disabled={
                  logs.length === 0 && onCampusCount === 0 && !latestScan
                }
                onClick={onRequestResetLogs}
                className="px-3 py-1.5 rounded-lg border border-slate-300 hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-40 disabled:pointer-events-none text-xs font-medium text-slate-700 flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Reset Logs</span>
              </button>
            </div>
          </div>

          {logs.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <CreditCard
                className="w-8 h-8 text-slate-300 mx-auto"
                aria-hidden="true"
              />
              <p className="text-sm font-medium text-slate-700">
                No gate scans recorded yet
              </p>
              <p className="text-xs text-slate-500">
                Entry, exit, and unknown card logs from ESP8266 RFID readers will
                stream here automatically.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[460px] overflow-y-auto">
              {logs.slice(0, 30).map((log) => {
                const isUnknown = log.eventType === 'UNKNOWN';
                return (
                  <div
                    key={log.id}
                    className={`px-5 py-3.5 flex items-center justify-between gap-4 transition-colors ${
                      isUnknown
                        ? 'bg-red-50/40 hover:bg-red-50/70'
                        : 'hover:bg-slate-50/80'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {isUnknown ? (
                        <div className="w-10 h-10 rounded-lg bg-red-100/80 border border-red-200 flex items-center justify-center shrink-0">
                          <ShieldAlert
                            className="w-5 h-5 text-red-600"
                            aria-hidden="true"
                          />
                        </div>
                      ) : (
                        <StudentAvatar
                          name={log.studentName}
                          photoDataUrl={log.photoDataUrl}
                          sizeClass="w-10 h-10"
                        />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <p
                            className={`text-sm font-semibold truncate ${
                              isUnknown ? 'text-red-900' : 'text-slate-900'
                            }`}
                          >
                            {isUnknown ? 'Unknown RFID Card' : log.studentName}
                          </p>
                          {isUnknown && (
                            <button
                              type="button"
                              onClick={() => onGoToEnroll(log.rfidUid)}
                              className="text-[11px] font-semibold text-[#2D72A8] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              Assign
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 truncate mt-0.5">
                          {isUnknown ? (
                            <>Unregistered Tag · </>
                          ) : (
                            <>
                              Class {log.classGrade}-{log.section} · Roll{' '}
                              <span className="tabular-nums">
                                {log.rollNumber}
                              </span>{' '}
                              ·{' '}
                            </>
                          )}
                          <span className="font-sans tabular-nums">
                            {formatRfidUidDisplay(log.rfidUid)}
                          </span>{' '}
                          · <span className="text-slate-400">{log.deviceCode}</span>
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 space-y-0.5">
                      <p
                        className={`text-xs font-bold tracking-wide ${
                          log.eventType === 'ENTRY'
                            ? 'text-emerald-700'
                            : log.eventType === 'EXIT'
                              ? 'text-amber-700'
                              : 'text-red-600'
                        }`}
                      >
                        {log.eventType}
                      </p>
                      <p className="text-xs text-slate-500 font-sans tabular-nums">
                        {log.scanDate} · {formatTime(log.scannedAt)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Class 1-12 Occupancy Breakdown */}
        <section className="lg:col-span-5 bg-white border border-slate-200/85 shadow-[0_1px_2px_rgba(15,23,42,0.04)] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200/80 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Class 1–12 Presence Summary
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                On campus vs. enrolled by grade
              </p>
            </div>
          </div>

          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {gradeSummary.map((row) => (
              <div
                key={row.grade}
                className="px-3.5 py-2.5 rounded-lg border border-slate-200/60 bg-slate-50/70 flex items-center justify-between gap-2 text-sm"
              >
                <span className="font-medium text-slate-700 whitespace-nowrap">
                  Class {row.grade}
                </span>
                <div className="flex items-center gap-2">
                  <div className="w-14 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#2D72A8] rounded-full transition-all"
                      style={{
                        width:
                          row.total > 0
                            ? `${Math.round((row.present / row.total) * 100)}%`
                            : '0%',
                      }}
                    />
                  </div>
                  <span className="font-sans text-xs tabular-nums text-slate-500 w-10 text-right">
                    <strong className="text-slate-900">{row.present}</strong>/{row.total}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
