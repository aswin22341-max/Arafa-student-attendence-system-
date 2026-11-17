import { useEffect, useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  RotateCcw,
  Search,
  ShieldAlert,
} from 'lucide-react';
import type {
  AttendanceEventType,
  AttendanceLogRecord,
} from '../types/attendance.ts';
import { formatRfidUidDisplay, formatScanDate } from '../utils/attendanceLogic.ts';
import { StudentAvatar } from './StudentAvatar.tsx';

interface ReportsViewProps {
  resetVersion?: number;
  onRequestResetLogs?: () => void;
  onFetchLogs: (filters: {
    fromDate?: string;
    toDate?: string;
    classGrade?: number | '';
    eventType?: AttendanceEventType | '';
    search?: string;
  }) => Promise<AttendanceLogRecord[]>;
  onExportCsv: (filters: {
    fromDate?: string;
    toDate?: string;
    classGrade?: number | '';
    eventType?: AttendanceEventType | '';
    search?: string;
  }) => Promise<void>;
}

export function ReportsView({
  resetVersion = 0,
  onRequestResetLogs,
  onFetchLogs,
  onExportCsv,
}: ReportsViewProps) {
  const today = formatScanDate(new Date());
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [classGrade, setClassGrade] = useState<number | ''>('');
  const [eventType, setEventType] = useState<AttendanceEventType | ''>('');
  const [search, setSearch] = useState('');

  const [logs, setLogs] = useState<AttendanceLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await onFetchLogs({
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        classGrade,
        eventType,
        search: search || undefined,
      });
      setLogs(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load historical attendance logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [fromDate, toDate, classGrade, eventType, resetVersion]);

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      await onExportCsv({
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        classGrade,
        eventType,
        search: search || undefined,
      });
    } catch (err: any) {
      setError(err?.message || 'Failed to export CSV report.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Historical Attendance & CSV Reports
          </h1>
          <p className="text-sm text-slate-500">
            Query cloud-stored entry and exit history across Classes 1–12 and
            export CSV spreadsheets for teachers
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {onRequestResetLogs && (
            <button
              type="button"
              onClick={onRequestResetLogs}
              className="px-3.5 py-2 rounded-lg border border-slate-300 hover:border-red-300 hover:bg-red-50 hover:text-red-700 text-slate-700 text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              <span>Reset Logs</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="px-4 py-2 rounded-lg bg-[#2D72A8] hover:bg-[#235B87] disabled:opacity-60 text-white text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            <span>{exporting ? 'Exporting CSV...' : 'Export CSV Report'}</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <section className="bg-white border border-slate-200/85 shadow-[0_1px_2px_rgba(15,23,42,0.04)] rounded-xl p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
          <div className="space-y-1">
            <label
              htmlFor="report-from"
              className="block text-xs font-medium text-slate-600"
            >
              From Date
            </label>
            <input
              id="report-from"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#2D72A8]"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="report-to"
              className="block text-xs font-medium text-slate-600"
            >
              To Date
            </label>
            <input
              id="report-to"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-[#2D72A8]"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="report-class"
              className="block text-xs font-medium text-slate-600"
            >
              Class
            </label>
            <select
              id="report-class"
              value={classGrade}
              onChange={(e) =>
                setClassGrade(e.target.value ? Number(e.target.value) : '')
              }
              className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#2D72A8]"
            >
              <option value="">All Classes (1–12)</option>
              {Array.from({ length: 12 }, (_, idx) => idx + 1).map((g) => (
                <option key={g} value={g}>
                  Class {g}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="report-event"
              className="block text-xs font-medium text-slate-600"
            >
              Event Type
            </label>
            <select
              id="report-event"
              value={eventType}
              onChange={(e) =>
                setEventType(
                  e.target.value === 'ENTRY' ||
                    e.target.value === 'EXIT' ||
                    e.target.value === 'UNKNOWN'
                    ? e.target.value
                    : ''
                )
              }
              className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#2D72A8]"
            >
              <option value="">All Events</option>
              <option value="ENTRY">Entry Only</option>
              <option value="EXIT">Exit Only</option>
              <option value="UNKNOWN">Unknown Cards</option>
            </select>
          </div>

          <div className="space-y-1 lg:col-span-2">
            <label
              htmlFor="report-search"
              className="block text-xs font-medium text-slate-600"
            >
              Search Student / Roll / RFID
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search
                  className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                  aria-hidden="true"
                />
                <input
                  id="report-search"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') loadLogs();
                  }}
                  placeholder="Name, roll number, or UID"
                  className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#2D72A8]"
                />
              </div>
              <button
                type="button"
                onClick={loadLogs}
                className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-sm font-medium text-slate-700 whitespace-nowrap cursor-pointer"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      </section>

      {error && (
        <div
          role="alert"
          className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700"
        >
          {error}
        </div>
      )}

      {/* Logs Table */}
      <section className="bg-white border border-slate-200/85 shadow-[0_1px_2px_rgba(15,23,42,0.04)] rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-900">
            Attendance Records ({logs.length})
          </span>
          <button
            type="button"
            onClick={() => {
              setFromDate('');
              setToDate('');
              setClassGrade('');
              setEventType('');
              setSearch('');
            }}
            className="text-xs font-medium text-[#2D72A8] hover:underline cursor-pointer"
          >
            Show All Historical Dates
          </button>
        </div>

        {loading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="h-10 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <FileSpreadsheet
              className="w-8 h-8 text-slate-300 mx-auto"
              aria-hidden="true"
            />
            <p className="text-sm font-medium text-slate-700">
              No attendance logs found for these filters
            </p>
            <p className="text-xs text-slate-500">
              Adjust the date range or class filter, or scan an enrolled RFID
              card on your ESP8266 reader.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4">Date & Time</th>
                  <th className="py-2.5 px-3">Student</th>
                  <th className="py-2.5 px-3">Class</th>
                  <th className="py-2.5 px-3">Roll No.</th>
                  <th className="py-2.5 px-3">RFID UID</th>
                  <th className="py-2.5 px-3">Gate Reader</th>
                  <th className="py-2.5 px-4 text-right">Event</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {logs.map((log) => {
                  const isUnknown = log.eventType === 'UNKNOWN';
                  return (
                    <tr
                      key={log.id}
                      className={
                        isUnknown
                          ? 'bg-red-50/40 hover:bg-red-50/70'
                          : 'hover:bg-slate-50/80'
                      }
                    >
                      <td className="py-2.5 px-4 font-sans text-xs tabular-nums text-slate-700 whitespace-nowrap">
                        {log.scanDate}{' '}
                        <span className="text-slate-400">
                          {new Date(log.scannedAt).toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2.5">
                          {isUnknown ? (
                            <div className="w-8 h-8 rounded-lg bg-red-100/80 border border-red-200 flex items-center justify-center shrink-0">
                              <ShieldAlert
                                className="w-4 h-4 text-red-600"
                                aria-hidden="true"
                              />
                            </div>
                          ) : (
                            <StudentAvatar
                              name={log.studentName}
                              photoDataUrl={log.photoDataUrl}
                              sizeClass="w-8 h-8"
                            />
                          )}
                          <span
                            className={`font-medium ${
                              isUnknown ? 'text-red-900' : 'text-slate-900'
                            }`}
                          >
                            {isUnknown ? 'Unknown RFID Card' : log.studentName}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                        {log.classGrade !== null
                          ? `Class ${log.classGrade}-${log.section}`
                          : 'Unregistered'}
                      </td>
                      <td className="py-2.5 px-3 font-sans text-xs tabular-nums text-slate-700">
                        {log.classGrade !== null ? log.rollNumber : '—'}
                      </td>
                      <td className="py-2.5 px-3 font-sans text-xs tabular-nums text-slate-600 whitespace-nowrap">
                        {formatRfidUidDisplay(log.rfidUid)}
                      </td>
                      <td className="py-2.5 px-3 font-sans text-xs text-slate-500 whitespace-nowrap">
                        {log.deviceCode}
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <span
                          className={`text-xs font-bold tracking-wide ${
                            log.eventType === 'ENTRY'
                              ? 'text-emerald-700'
                              : log.eventType === 'EXIT'
                                ? 'text-amber-700'
                                : 'text-red-600'
                          }`}
                        >
                          {log.eventType}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
