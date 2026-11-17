import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Cpu,
  FileSpreadsheet,
  KeyRound,
  LogOut,
  Menu,
  Radio,
  ShieldAlert,
  UserPlus,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import type {
  AttendanceEventType,
  AttendanceLogRecord,
  RfidDeviceRecord,
  StudentRecord,
  UnregisteredScanPayload,
} from '../types/attendance.ts';
import {
  changeAdminPassword,
  createDevice,
  dismissUnregisteredScanApi,
  downloadCsvReport,
  enrollStudent,
  fetchAttendanceLogs,
  fetchDevices,
  fetchLiveAttendanceState,
  removeDevice,
  removeStudent,
  resetAttendanceLogsApi,
  simulateHardwareScan,
  updateStudentProfile,
} from '../utils/api.ts';
import {
  formatRfidUidDisplay,
  formatScanDate,
} from '../utils/attendanceLogic.ts';
import { parseRfidUidFromSerialLine } from '../utils/serialRfid.ts';
import {
  playCardReadTone,
  unlockAudioContext,
  type ScanToneKind,
} from '../utils/soundAlert.ts';
import { AdminEnrollmentView } from './AdminEnrollmentView.tsx';
import { Esp8266HardwareView } from './Esp8266HardwareView.tsx';
import { LiveMonitorView } from './LiveMonitorView.tsx';
import { ReportsView } from './ReportsView.tsx';

type ActiveTab = 'live' | 'enroll' | 'reports' | 'hardware';

const NAV_ITEMS: {
  id: ActiveTab;
  label: string;
  description: string;
  icon: typeof Radio;
}[] = [
  {
    id: 'live',
    label: 'Live Gate Monitor',
    description: 'Real-time taps & presence',
    icon: Radio,
  },
  {
    id: 'enroll',
    label: 'Student Enrollment',
    description: 'Classes 1–12 & RFID tags',
    icon: UserPlus,
  },
  {
    id: 'reports',
    label: 'Attendance & CSV',
    description: 'History & teacher export',
    icon: FileSpreadsheet,
  },
  {
    id: 'hardware',
    label: 'ESP8266 Setup',
    description: 'Gate readers & firmware',
    icon: Cpu,
  },
];

export function DashboardShell() {
  const { admin, logout, getToken } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>('live');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [logs, setLogs] = useState<AttendanceLogRecord[]>([]);
  const [devices, setDevices] = useState<RfidDeviceRecord[]>([]);
  const [latestScan, setLatestScan] = useState<AttendanceLogRecord | null>(
    null
  );
  const [unregisteredScan, setUnregisteredScan] =
    useState<UnregisteredScanPayload | null>(null);
  const [prefillRfidUid, setPrefillRfidUid] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // USB Serial Reader state (persists across tabs)
  const [usbSupported] = useState(
    () => typeof navigator !== 'undefined' && 'serial' in navigator
  );
  const [usbConnected, setUsbConnected] = useState(false);
  const [usbError, setUsbError] = useState<string | null>(null);
  const [usbSerialLogs, setUsbSerialLogs] = useState<string[]>([]);
  const [scanNotice, setScanNotice] = useState<string | null>(null);

  // Change Password modal state
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState<{
    type: 'error' | 'success';
    text: string;
  } | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  // Reset Logs confirmation modal state
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resettingLogs, setResettingLogs] = useState(false);
  const [resetLogsError, setResetLogsError] = useState<string | null>(null);
  const [resetVersion, setResetVersion] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const usbPortRef = useRef<any>(null);
  const usbReaderRef = useRef<ReadableStreamDefaultReader<string> | null>(null);
  const usbClosingRef = useRef(false);
  const lastSerialScansRef = useRef<Map<string, number>>(new Map());
  const studentsRef = useRef<StudentRecord[]>([]);
  const scanNoticeTimerRef = useRef<number | null>(null);
  const soundEnabledRef = useRef(true);
  const dismissedUnknownKeysRef = useRef<Set<string>>(new Set());
  const unregisteredScanRef = useRef<UnregisteredScanPayload | null>(null);
  const lastToneKeyRef = useRef<{ key: string; at: number }>({
    key: '',
    at: 0,
  });

  useEffect(() => {
    studentsRef.current = students;
  }, [students]);

  useEffect(() => {
    unregisteredScanRef.current = unregisteredScan;
  }, [unregisteredScan]);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    const handleUnlock = () => unlockAudioContext();
    window.addEventListener('pointerdown', handleUnlock, { passive: true });
    window.addEventListener('keydown', handleUnlock, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', handleUnlock);
      window.removeEventListener('keydown', handleUnlock);
    };
  }, []);

  const playToneOnce = useCallback((kind: ScanToneKind, dedupeKey: string) => {
    if (!soundEnabledRef.current) return;
    const now = Date.now();
    if (
      lastToneKeyRef.current.key === dedupeKey &&
      now - lastToneKeyRef.current.at < 2500
    ) {
      return;
    }
    lastToneKeyRef.current = { key: dedupeKey, at: now };
    playCardReadTone(kind);
  }, []);

  const prependIncomingLog = useCallback((incomingLog: AttendanceLogRecord) => {
    setLogs((prev) => {
      if (prev.some((l) => l.id === incomingLog.id)) return prev;
      return [incomingLog, ...prev];
    });
    setLatestScan(incomingLog);
  }, []);

  const showScanNotice = useCallback((message: string) => {
    setScanNotice(message);
    if (scanNoticeTimerRef.current !== null) {
      clearTimeout(scanNoticeTimerRef.current);
    }
    scanNoticeTimerRef.current = window.setTimeout(() => {
      setScanNotice(null);
    }, 3500);
  }, []);

  const syncLiveState = useCallback(async () => {
    try {
      const token = await getToken();
      const live = await fetchLiveAttendanceState(token);
      setStudents(live.students);
      setLogs(live.logs);
      setLatestScan(live.logs.length > 0 ? live.logs[0] : null);
      if (live.latestUnregistered) {
        const key = `${live.latestUnregistered.rfidUid}:${live.latestUnregistered.scannedAt}`;
        if (!dismissedUnknownKeysRef.current.has(key)) {
          setUnregisteredScan({
            type: 'rfid:unregistered',
            ...live.latestUnregistered,
          });
        }
      }
    } catch {
      // Ignore transient sync errors
    }
  }, [getToken]);

  const loadInitialData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const token = await getToken();
      const [liveState, deviceRows] = await Promise.all([
        fetchLiveAttendanceState(token),
        fetchDevices(token),
      ]);
      setStudents(liveState.students);
      setLogs(liveState.logs);
      setDevices(deviceRows);
      if (liveState.logs.length > 0) {
        setLatestScan(liveState.logs[0]);
      }
      if (liveState.latestUnregistered) {
        setUnregisteredScan({
          type: 'rfid:unregistered',
          ...liveState.latestUnregistered,
        });
      }
    } catch (err: any) {
      setLoadError(err?.message || 'Failed to load attendance data.');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Background sync every 3s across open dashboard sessions
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      syncLiveState();
    }, 3000);
    return () => clearInterval(intervalId);
  }, [syncLiveState]);

  const handleRealtimeMessage = useCallback(
    (msg: any) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'auth:ok') {
        syncLiveState();
      } else if (msg.type === 'attendance:scan') {
        const incomingStudent: StudentRecord = msg.student;
        const incomingLog: AttendanceLogRecord = msg.log;

        setStudents((prev) => {
          const exists = prev.some((s) => s.id === incomingStudent.id);
          if (!exists) return [...prev, incomingStudent];
          return prev.map((s) =>
            s.id === incomingStudent.id ? incomingStudent : s
          );
        });
        prependIncomingLog(incomingLog);
        setUnregisteredScan(null);
        playToneOnce(incomingLog.eventType, `log:${incomingLog.id}`);
      } else if (msg.type === 'rfid:unregistered') {
        const payload = msg as UnregisteredScanPayload;
        if (payload.log) {
          prependIncomingLog(payload.log);
        }
        const key = `${payload.rfidUid}:${payload.scannedAt}`;
        if (!dismissedUnknownKeysRef.current.has(key)) {
          setUnregisteredScan(payload);
        }
        playToneOnce('UNKNOWN', `unknown:${key}`);
      } else if (msg.type === 'student:enrolled') {
        const s: StudentRecord = msg.student;
        setStudents((prev) =>
          prev.some((row) => row.id === s.id) ? prev : [...prev, s]
        );
        setUnregisteredScan((prev) =>
          prev?.rfidUid === s.rfidUid ? null : prev
        );
      } else if (msg.type === 'student:updated') {
        const s: StudentRecord = msg.student;
        setStudents((prev) => prev.map((row) => (row.id === s.id ? s : row)));
        setLatestScan((prev) =>
          prev && prev.studentId === s.id
            ? {
                ...prev,
                studentName: s.fullName,
                classGrade: s.classGrade,
                section: s.section,
                rollNumber: s.rollNumber,
                photoDataUrl: s.photoDataUrl,
              }
            : prev
        );
      } else if (msg.type === 'student:deleted') {
        const id = Number(msg.studentId);
        setStudents((prev) => prev.filter((row) => row.id !== id));
        setLogs((prev) => prev.filter((l) => l.studentId !== id));
      } else if (msg.type === 'logs:reset') {
        setLogs([]);
        setLatestScan(null);
        setUnregisteredScan(null);
        setStudents((prev) =>
          prev.map((row) => ({ ...row, currentStatus: 'OUT', lastScanAt: null }))
        );
        setResetVersion((v) => v + 1);
      }
    },
    [playToneOnce, prependIncomingLog, syncLiveState]
  );

  // HTTPS SSE real-time stream (updates dashboard immediately on card scan)
  useEffect(() => {
    let cancelled = false;
    let abortCtrl: AbortController | null = null;
    let retryTimer: number | null = null;

    const connectSse = async () => {
      try {
        const token = await getToken();
        if (cancelled) return;

        abortCtrl = new AbortController();
        const res = await fetch('/api/rfid/stream', {
          headers: { Authorization: `Bearer ${token}` },
          signal: abortCtrl.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(`Stream status ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!cancelled) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const chunks = buffer.split('\n\n');
          buffer = chunks.pop() ?? '';

          for (const chunk of chunks) {
            const lines = chunk.split('\n');
            for (const line of lines) {
              if (!line.startsWith('data:')) continue;
              const rawJson = line.slice(5).trim();
              if (!rawJson) continue;
              try {
                handleRealtimeMessage(JSON.parse(rawJson));
              } catch {
                // Ignore malformed SSE event
              }
            }
          }
        }
      } catch {
        // Fall through to reconnect
      } finally {
        if (!cancelled) {
          retryTimer = window.setTimeout(connectSse, 2500);
        }
      }
    };

    connectSse();

    return () => {
      cancelled = true;
      abortCtrl?.abort();
      if (retryTimer !== null) {
        clearTimeout(retryTimer);
      }
    };
  }, [getToken, handleRealtimeMessage]);

  const disconnectUsbSerial = useCallback(async () => {
    usbClosingRef.current = true;
    try {
      await usbReaderRef.current?.cancel();
    } catch {
      // Ignore cancel errors
    }
    try {
      await usbPortRef.current?.close();
    } catch {
      // Ignore port close errors
    }
    usbReaderRef.current = null;
    usbPortRef.current = null;
    setUsbConnected(false);
  }, []);

  useEffect(() => {
    return () => {
      disconnectUsbSerial();
    };
  }, [disconnectUsbSerial]);

  const handleSimulateScan = useCallback(
    async (rfidUid: string, deviceCode: string) => {
      // Optimistic instant spotlight if student is already enrolled locally
      const matchedStudent = studentsRef.current.find(
        (s) => s.rfidUid === rfidUid
      );
      const tempId = -Date.now();
      let optimisticApplied = false;

      if (matchedStudent) {
        const now = new Date();
        const optimisticEvent: AttendanceEventType =
          matchedStudent.currentStatus === 'OUT' ? 'ENTRY' : 'EXIT';
        const optimisticLog: AttendanceLogRecord = {
          id: tempId,
          studentId: matchedStudent.id,
          rfidUid: matchedStudent.rfidUid,
          eventType: optimisticEvent,
          deviceCode,
          scanDate: formatScanDate(now),
          scannedAt: now.toISOString(),
          studentName: matchedStudent.fullName,
          rollNumber: matchedStudent.rollNumber,
          classGrade: matchedStudent.classGrade,
          section: matchedStudent.section,
          photoDataUrl: matchedStudent.photoDataUrl,
        };
        optimisticApplied = true;
        setLatestScan(optimisticLog);
        setUnregisteredScan(null);
      }

      const token = await getToken();
      const res = await simulateHardwareScan(token, rfidUid, deviceCode);

      if (res?.status === 'logged' && res.student && res.log) {
        const incomingStudent: StudentRecord = res.student;
        const incomingLog: AttendanceLogRecord = res.log;
        setStudents((prev) => {
          const exists = prev.some((s) => s.id === incomingStudent.id);
          if (!exists) return [...prev, incomingStudent];
          return prev.map((s) =>
            s.id === incomingStudent.id ? incomingStudent : s
          );
        });
        prependIncomingLog(incomingLog);
        setUnregisteredScan(null);
        setScanNotice(null);
        playToneOnce(incomingLog.eventType, `log:${incomingLog.id}`);
      } else if (res?.status === 'debounced') {
        if (optimisticApplied) {
          syncLiveState();
        }
        showScanNotice(
          `${res.studentName} scanned just now (${Math.ceil((res.remainingMs || 1000) / 1000)}s cooldown before next toggle).`
        );
      } else if (res?.status === 'unregistered') {
        if (res.log) {
          prependIncomingLog(res.log as AttendanceLogRecord);
        }
        const key = `${res.rfidUid}:${res.scannedAt}`;
        if (!dismissedUnknownKeysRef.current.has(key)) {
          setUnregisteredScan({
            type: 'rfid:unregistered',
            rfidUid: res.rfidUid,
            deviceCode: res.deviceCode,
            scannedAt: res.scannedAt,
            log: res.log,
          });
        }
        playToneOnce('UNKNOWN', `unknown:${key}`);
      }

      return res;
    },
    [getToken, playToneOnce, prependIncomingLog, showScanNotice, syncLiveState]
  );

  const connectUsbSerial = useCallback(
    async (deviceCode: string) => {
      unlockAudioContext();
      setUsbError(null);
      if (!('serial' in navigator)) {
        setUsbError(
          'Web Serial is not supported in this browser. Open this portal in Google Chrome or Microsoft Edge over HTTPS/localhost.'
        );
        return;
      }

      try {
        const navSerial = (navigator as any).serial;
        const port = await navSerial.requestPort();
        await port.open({ baudRate: 115200 });
        usbPortRef.current = port;
        usbClosingRef.current = false;
        setUsbConnected(true);
        const startStamp = new Date().toLocaleTimeString('en-US', {
          hour12: true,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        setUsbSerialLogs((prev) => [
          ...prev.slice(-19),
          `[${formatScanDate(new Date())} ${startStamp}] USB Connected at 115200 baud (${deviceCode})`,
        ]);

        const decoder = new TextDecoderStream();
        port.readable.pipeTo(decoder.writable).catch(() => {});
        const reader = decoder.readable.getReader();
        usbReaderRef.current = reader;

        let buffer = '';
        while (!usbClosingRef.current) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!value) continue;

          buffer += value;
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? '';

          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line) continue;
            const now = new Date();
            const stamp = `${formatScanDate(now)} ${now.toLocaleTimeString(
              'en-US',
              {
                hour12: true,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              }
            )}`;
            setUsbSerialLogs((prev) => [...prev.slice(-19), `[${stamp}] ${line}`]);

            const parsedUid = parseRfidUidFromSerialLine(line);
            if (parsedUid) {
              const nowMs = Date.now();
              const prevAt = lastSerialScansRef.current.get(parsedUid) ?? 0;
              if (nowMs - prevAt < 900) {
                continue;
              }
              lastSerialScansRef.current.set(parsedUid, nowMs);
              handleSimulateScan(parsedUid, deviceCode).catch((err) => {
                setUsbSerialLogs((prev) => [
                  ...prev.slice(-19),
                  `[${stamp}] [Error] ${err?.message || 'Scan failed'}`,
                ]);
              });
            }
          }
        }
      } catch (err: any) {
        if (err?.name !== 'NotFoundError') {
          const msg = String(err?.message || '');
          if (msg.toLowerCase().includes('permissions policy')) {
            setUsbError(
              'USB Serial is blocked inside an embedded preview frame. Open this app URL in its own Chrome/Edge browser tab to connect via USB.'
            );
          } else {
            setUsbError(msg || 'Could not open ESP8266 USB serial port.');
          }
        }
        setUsbConnected(false);
      }
    },
    [handleSimulateScan]
  );

  const handleGoToEnroll = (uid?: string) => {
    if (uid) {
      setPrefillRfidUid(uid);
    }
    setActiveTab('enroll');
    setMobileMenuOpen(false);
  };

  const handleCreateStudent = async (payload: {
    rfidUid: string;
    rollNumber: string;
    fullName: string;
    classGrade: number;
    section: string;
    guardianName: string | null;
    guardianPhone: string | null;
    photoDataUrl: string | null;
  }) => {
    const token = await getToken();
    const created = await enrollStudent(token, payload);
    setStudents((prev) =>
      prev.some((s) => s.id === created.id) ? prev : [...prev, created]
    );
    if (unregisteredScan?.rfidUid === created.rfidUid) {
      setUnregisteredScan(null);
    }
  };

  const handleUpdateStudent = async (
    id: number,
    payload: {
      rfidUid: string;
      rollNumber: string;
      fullName: string;
      classGrade: number;
      section: string;
      guardianName: string | null;
      guardianPhone: string | null;
      photoDataUrl: string | null;
    }
  ) => {
    const token = await getToken();
    const updated = await updateStudentProfile(token, id, payload);
    setStudents((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  };

  const handleDeleteStudent = async (id: number) => {
    const token = await getToken();
    await removeStudent(token, id);
    setStudents((prev) => prev.filter((s) => s.id !== id));
    setLogs((prev) => prev.filter((l) => l.studentId !== id));
    if (latestScan?.studentId === id) {
      setLatestScan(null);
    }
  };

  const handleFetchLogs = async (filters: {
    fromDate?: string;
    toDate?: string;
    classGrade?: number | '';
    eventType?: AttendanceEventType | '';
    search?: string;
  }) => {
    const token = await getToken();
    return fetchAttendanceLogs(token, filters);
  };

  const handleExportCsv = async (filters: {
    fromDate?: string;
    toDate?: string;
    classGrade?: number | '';
    eventType?: AttendanceEventType | '';
    search?: string;
  }) => {
    const token = await getToken();
    await downloadCsvReport(token, filters);
  };

  const handleCreateDevice = async (payload: {
    deviceCode: string;
    locationName: string;
  }) => {
    const token = await getToken();
    const created = await createDevice(token, payload);
    setDevices((prev) => [created, ...prev]);
    return created;
  };

  const handleDeleteDevice = async (id: number) => {
    const token = await getToken();
    await removeDevice(token, id);
    setDevices((prev) => prev.filter((d) => d.id !== id));
  };

  const handleDismissUnregistered = useCallback(
    async (target?: UnregisteredScanPayload | null) => {
      const current = target ?? unregisteredScanRef.current;
      if (current) {
        dismissedUnknownKeysRef.current.add(
          `${current.rfidUid}:${current.scannedAt}`
        );
      }
      setUnregisteredScan(null);
      try {
        const token = await getToken();
        await dismissUnregisteredScanApi(token);
      } catch {
        // Ignore dismiss network error
      }
    },
    [getToken]
  );

  // Auto-dismiss unknown card warning overlay after 3 seconds
  useEffect(() => {
    if (!unregisteredScan) return;
    const target = unregisteredScan;
    const autoDismissTimer = window.setTimeout(() => {
      handleDismissUnregistered(target);
    }, 3000);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleDismissUnregistered(target);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      clearTimeout(autoDismissTimer);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [unregisteredScan, handleDismissUnregistered]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordStatus(null);
    if (newPassword.length < 6) {
      setPasswordStatus({
        type: 'error',
        text: 'New password must be at least 6 characters long.',
      });
      return;
    }

    setSavingPassword(true);
    try {
      const token = await getToken();
      await changeAdminPassword(token, currentPassword, newPassword);
      setPasswordStatus({
        type: 'success',
        text: 'Administrator password updated.',
      });
      setCurrentPassword('');
      setNewPassword('');
    } catch (err: any) {
      setPasswordStatus({
        type: 'error',
        text: err?.message || 'Could not update password.',
      });
    } finally {
      setSavingPassword(false);
    }
  };

  const handleConfirmResetLogs = async () => {
    setResettingLogs(true);
    setResetLogsError(null);
    try {
      const token = await getToken();
      await resetAttendanceLogsApi(token);
      setLogs([]);
      setLatestScan(null);
      setUnregisteredScan(null);
      setStudents((prev) =>
        prev.map((row) => ({ ...row, currentStatus: 'OUT', lastScanAt: null }))
      );
      setResetVersion((v) => v + 1);
      setResetModalOpen(false);
      showScanNotice(
        'Attendance logs cleared and all students reset to Checked Out (OUT).'
      );
    } catch (err: any) {
      setResetLogsError(err?.message || 'Could not reset attendance logs.');
    } finally {
      setResettingLogs(false);
    }
  };

  const currentNavLabel =
    NAV_ITEMS.find((item) => item.id === activeTab)?.label || '';

  return (
    <div className="min-h-screen bg-slate-50/90 flex flex-col">
      {/* Executive White Top Header with Enlarged School Logo */}
      <header className="min-h-[68px] sm:h-24 bg-white border-b border-slate-200/90 px-3 sm:px-6 flex items-center justify-between gap-3 sm:gap-6 shrink-0 sticky top-0 z-30 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="flex items-center gap-2.5 sm:gap-5 min-w-0">
          <button
            type="button"
            aria-label="Open navigation menu"
            onClick={() => setMobileMenuOpen(true)}
            className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 shrink-0 cursor-pointer"
          >
            <Menu className="w-5 h-5" aria-hidden="true" />
          </button>

          <img
            src="/assets/aistudio/logo-light_8b7c036c.png"
            alt="Arafa English School"
            referrerPolicy="no-referrer"
            className="h-12 sm:h-20 w-auto max-w-[195px] sm:max-w-none object-contain shrink-0"
          />

          <div className="hidden md:flex items-center gap-2.5 pl-5 border-l border-slate-200 text-sm text-slate-500 whitespace-nowrap">
            <span>Classes 1–12</span>
            <span aria-hidden="true" className="text-slate-300">
              /
            </span>
            <span className="font-semibold text-slate-900">
              {currentNavLabel}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          <span className="hidden xl:inline text-xs font-medium text-slate-500 whitespace-nowrap mr-1">
            {admin?.fullName} · {admin?.username}
          </span>
          <button
            type="button"
            aria-label={
              soundEnabled
                ? 'Mute scan audio alerts'
                : 'Enable scan audio alerts'
            }
            aria-pressed={soundEnabled}
            onClick={() => {
              unlockAudioContext();
              setSoundEnabled((prev) => !prev);
            }}
            className={`px-2.5 sm:px-3 py-2 rounded-lg border text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
              soundEnabled
                ? 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                : 'border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800'
            }`}
          >
            {soundEnabled ? (
              <Volume2
                className="w-3.5 h-3.5 text-[#2D72A8]"
                aria-hidden="true"
              />
            ) : (
              <VolumeX className="w-3.5 h-3.5 text-amber-700" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">
              {soundEnabled ? 'Sound On' : 'Muted'}
            </span>
          </button>
          <button
            type="button"
            aria-label="Change administrator password"
            onClick={() => {
              setPasswordStatus(null);
              setPasswordModalOpen(true);
            }}
            className="px-2.5 sm:px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700 flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
          >
            <KeyRound className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
            <span className="hidden sm:inline">Password</span>
          </button>
          <button
            type="button"
            aria-label="Sign out"
            onClick={logout}
            className="px-2.5 sm:px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700 flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
          >
            <LogOut className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Executive Desktop Sidebar */}
        <aside className="hidden lg:flex lg:w-68 lg:flex-col bg-white border-r border-slate-200/90 shrink-0 justify-between">
          <div className="p-4 space-y-3">
            <p className="px-3 text-xs font-semibold text-slate-400">
              Campus Operations
            </p>
            <nav
              aria-label="Primary Workspace Navigation"
              className="space-y-1.5"
            >
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full px-3.5 py-2.5 rounded-xl text-left flex items-start gap-3 transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#2D72A8]/10 text-[#184B75] ring-1 ring-[#2D72A8]/15'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 shrink-0 mt-0.5 ${
                        active ? 'text-[#2D72A8]' : 'text-slate-400'
                      }`}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p
                        className={`text-sm leading-tight whitespace-nowrap ${
                          active ? 'font-semibold text-[#184B75]' : 'font-medium'
                        }`}
                      >
                        {item.label}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                        {item.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="p-5 border-t border-slate-200/80 space-y-1 text-xs text-slate-500">
            <p className="font-semibold text-slate-800">Arafa English School</p>
            <p>Attur · CBSE Affiliation No. 930181</p>
          </div>
        </aside>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            <div
              className="fixed inset-0 bg-slate-950/40"
              onClick={() => setMobileMenuOpen(false)}
            />
            <aside className="relative w-72 max-w-full bg-white text-slate-900 flex flex-col z-10 border-r border-slate-200">
              <div className="h-20 px-4 flex items-center justify-between border-b border-slate-200">
                <img
                  src="/assets/aistudio/logo-light_8b7c036c.png"
                  alt="Arafa English School"
                  referrerPolicy="no-referrer"
                  className="h-14 w-auto object-contain"
                />
                <button
                  type="button"
                  aria-label="Close navigation menu"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2 text-slate-500 hover:text-slate-900 cursor-pointer"
                >
                  <X className="w-5 h-5" aria-hidden="true" />
                </button>
              </div>
              <nav className="flex-1 p-3 space-y-1">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full px-3.5 py-3 rounded-xl text-left flex items-start gap-3 cursor-pointer ${
                        active
                          ? 'bg-[#2D72A8]/10 text-[#184B75] ring-1 ring-[#2D72A8]/15'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                      <div>
                        <p className="text-sm font-semibold">{item.label}</p>
                        <p className="text-xs text-slate-500">{item.description}</p>
                      </div>
                    </button>
                  );
                })}
              </nav>
            </aside>
          </div>
        )}

        {/* Main Content Viewport */}
        <main className="flex-1 p-5 sm:p-7 max-w-7xl w-full mx-auto min-w-0">
          {loadError && (
            <div
              role="alert"
              className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 flex items-center justify-between gap-4"
            >
              <p className="text-sm text-red-700">{loadError}</p>
              <button
                type="button"
                onClick={loadInitialData}
                className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium whitespace-nowrap cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}

          {activeTab === 'live' && (
            <LiveMonitorView
              students={students}
              logs={logs}
              latestScan={latestScan}
              scanNotice={scanNotice}
              usbError={usbError}
              loading={loading}
              onRequestResetLogs={() => {
                setResetLogsError(null);
                setResetModalOpen(true);
              }}
              onGoToEnroll={handleGoToEnroll}
              onGoToHardware={() => setActiveTab('hardware')}
            />
          )}

          {activeTab === 'enroll' && (
            <AdminEnrollmentView
              students={students}
              prefillRfidUid={prefillRfidUid}
              unregisteredScan={unregisteredScan}
              onClearPrefill={() => setPrefillRfidUid(null)}
              onCreateStudent={handleCreateStudent}
              onUpdateStudent={handleUpdateStudent}
              onDeleteStudent={handleDeleteStudent}
            />
          )}

          {activeTab === 'reports' && (
            <ReportsView
              resetVersion={resetVersion}
              onRequestResetLogs={() => {
                setResetLogsError(null);
                setResetModalOpen(true);
              }}
              onFetchLogs={handleFetchLogs}
              onExportCsv={handleExportCsv}
            />
          )}

          {activeTab === 'hardware' && (
            <Esp8266HardwareView
              devices={devices}
              students={students}
              onCreateDevice={handleCreateDevice}
              onDeleteDevice={handleDeleteDevice}
              onSimulateScan={handleSimulateScan}
              usbSupported={usbSupported}
              usbConnected={usbConnected}
              usbError={usbError}
              usbSerialLogs={usbSerialLogs}
              onConnectUsb={connectUsbSerial}
              onDisconnectUsb={disconnectUsbSerial}
            />
          )}
        </main>
      </div>

      {/* Change Admin Password Modal */}
      {passwordModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="password-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2
                id="password-modal-title"
                className="text-base font-bold text-slate-900"
              >
                Change Administrator Password
              </h2>
              <button
                type="button"
                aria-label="Close password modal"
                onClick={() => setPasswordModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {passwordStatus && (
              <div
                role="alert"
                className={`p-3 rounded-lg border text-xs ${
                  passwordStatus.type === 'error'
                    ? 'bg-red-50 border-red-200 text-red-700'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                }`}
              >
                {passwordStatus.text}
              </div>
            )}

            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="current-admin-password"
                  className="block text-xs font-medium text-slate-700"
                >
                  Current Password
                </label>
                <input
                  id="current-admin-password"
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#2D72A8]"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="new-admin-password"
                  className="block text-xs font-medium text-slate-700"
                >
                  New Password (minimum 6 characters)
                </label>
                <input
                  id="new-admin-password"
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#2D72A8]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPasswordModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={savingPassword}
                  className="px-4 py-2 rounded-lg bg-[#2D72A8] hover:bg-[#235B87] disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
                >
                  {savingPassword ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Attendance Logs Confirmation Modal */}
      {resetModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-logs-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2
                id="reset-logs-modal-title"
                className="text-base font-bold text-slate-900"
              >
                Reset Attendance Logs?
              </h2>
              <button
                type="button"
                aria-label="Close reset logs modal"
                onClick={() => setResetModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              This will permanently delete all recorded ENTRY and EXIT logs and
              reset every student&apos;s campus status to Checked Out (OUT).
              Enrolled student profiles and RFID card assignments will remain
              intact.
            </p>

            {resetLogsError && (
              <div
                role="alert"
                className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700"
              >
                {resetLogsError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={resettingLogs}
                onClick={() => setResetModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={resettingLogs}
                onClick={handleConfirmResetLogs}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
              >
                {resettingLogs ? 'Resetting...' : 'Confirm Reset Logs'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Full-Screen Unknown RFID Card Warning Overlay (auto-dismisses after 3s) */}
      {unregisteredScan && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="unknown-rfid-warning-title"
          aria-describedby="unknown-rfid-warning-desc"
          data-testid="unknown-card-fullscreen-warning"
          className="fixed inset-0 z-50 bg-red-950/95 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8 overflow-y-auto"
        >
          <div className="max-w-3xl w-full bg-red-900/75 border-2 border-red-400/40 rounded-2xl p-6 sm:p-10 text-center space-y-6 shadow-2xl overflow-hidden relative">
            <div
              key={`${unregisteredScan.rfidUid}:${unregisteredScan.scannedAt}`}
              className="absolute top-0 left-0 right-0 h-1.5 bg-red-400/90 animate-shrink-3s"
            />

            <div className="mx-auto w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-red-600 border-2 border-red-300/60 flex items-center justify-center shadow-lg">
              <ShieldAlert
                className="w-11 h-11 sm:w-14 sm:h-14 text-white"
                aria-hidden="true"
              />
            </div>

            <div className="space-y-2.5">
              <p className="text-xs sm:text-sm font-bold tracking-widest uppercase text-red-200">
                Security Warning · Unregistered Card
              </p>
              <h2
                id="unknown-rfid-warning-title"
                className="text-2xl sm:text-4xl font-bold tracking-tight text-white"
              >
                Unknown RFID Card Detected
              </h2>
              <p
                id="unknown-rfid-warning-desc"
                className="text-sm sm:text-base text-red-100 max-w-lg mx-auto leading-relaxed"
              >
                This RFID card is not registered to any student at Arafa English
                School. The tap has been recorded in the gate log.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
              <div className="px-4 py-3 rounded-xl bg-red-950/70 border border-red-400/30">
                <p className="text-[11px] font-medium uppercase tracking-wide text-red-200/80">
                  RFID Card UID
                </p>
                <p className="text-base font-bold text-white tabular-nums mt-0.5 whitespace-nowrap">
                  {formatRfidUidDisplay(unregisteredScan.rfidUid)}
                </p>
              </div>
              <div className="px-4 py-3 rounded-xl bg-red-950/70 border border-red-400/30">
                <p className="text-[11px] font-medium uppercase tracking-wide text-red-200/80">
                  Gate Reader
                </p>
                <p className="text-base font-bold text-white truncate mt-0.5">
                  {unregisteredScan.deviceCode}
                </p>
              </div>
              <div className="px-4 py-3 rounded-xl bg-red-950/70 border border-red-400/30">
                <p className="text-[11px] font-medium uppercase tracking-wide text-red-200/80">
                  Date &amp; Time
                </p>
                <p className="text-sm font-bold text-white tabular-nums mt-0.5 whitespace-nowrap">
                  {formatScanDate(new Date(unregisteredScan.scannedAt))} ·{' '}
                  {new Date(unregisteredScan.scannedAt).toLocaleTimeString(
                    'en-US',
                    {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      hour12: true,
                    }
                  )}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  const current = unregisteredScan;
                  handleDismissUnregistered(current);
                  handleGoToEnroll(current.rfidUid);
                }}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-white hover:bg-red-50 text-red-950 text-sm font-bold transition-colors cursor-pointer"
              >
                Assign Card to Student
              </button>
              <button
                type="button"
                onClick={() => handleDismissUnregistered(unregisteredScan)}
                className="w-full sm:w-auto px-6 py-3 rounded-xl border border-red-300/50 bg-red-950/40 hover:bg-red-950/70 text-white text-sm font-semibold transition-colors cursor-pointer"
              >
                Dismiss Warning
              </button>
            </div>

            <p className="text-xs text-red-200/80">
              This warning automatically closes in 3 seconds
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
