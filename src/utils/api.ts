import type {
  AttendanceEventType,
  AttendanceLogRecord,
  RfidDeviceRecord,
  StudentRecord,
} from '../types/attendance.ts';

export interface AdminProfile {
  id: number;
  username: string;
  fullName: string;
}

export async function loginAdmin(
  username: string,
  password: string
): Promise<{ token: string; admin: AdminProfile }> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'Sign-in failed.');
  }
  return data;
}

export async function fetchAdminMe(token: string): Promise<AdminProfile> {
  const res = await fetch('/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error('Session expired');
  }
  const data = await res.json();
  return data.admin;
}

export async function changeAdminPassword(
  token: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const res = await fetch('/api/auth/change-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'Could not update password.');
  }
}

async function authFetch<T>(
  url: string,
  token: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) {
        message = data.error;
      }
      if (data?.fieldErrors) {
        const err = new Error(message) as Error & {
          fieldErrors?: Record<string, string>;
        };
        err.fieldErrors = data.fieldErrors;
        throw err;
      }
    } catch (e: any) {
      if (e?.fieldErrors) throw e;
    }
    throw new Error(message);
  }

  return res.json();
}

export async function fetchStudents(
  token: string,
  filters?: { classGrade?: number | ''; search?: string }
): Promise<StudentRecord[]> {
  const params = new URLSearchParams();
  if (filters?.classGrade) {
    params.set('classGrade', String(filters.classGrade));
  }
  if (filters?.search) {
    params.set('search', filters.search);
  }
  const qs = params.toString();
  const data = await authFetch<{ students: StudentRecord[] }>(
    `/api/students${qs ? `?${qs}` : ''}`,
    token
  );
  return data.students;
}

export interface StudentPayload {
  rfidUid: string;
  rollNumber: string;
  fullName: string;
  classGrade: number;
  section: string;
  guardianName?: string | null;
  guardianPhone?: string | null;
  photoDataUrl?: string | null;
}

export async function enrollStudent(
  token: string,
  payload: StudentPayload
): Promise<StudentRecord> {
  const data = await authFetch<{ student: StudentRecord }>(
    '/api/students',
    token,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
  return data.student;
}

export async function updateStudentProfile(
  token: string,
  id: number,
  payload: StudentPayload
): Promise<StudentRecord> {
  const data = await authFetch<{ student: StudentRecord }>(
    `/api/students/${id}`,
    token,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    }
  );
  return data.student;
}

export async function removeStudent(token: string, id: number): Promise<void> {
  await authFetch<{ deleted: boolean }>(`/api/students/${id}`, token, {
    method: 'DELETE',
  });
}

export interface LogFilters {
  fromDate?: string;
  toDate?: string;
  classGrade?: number | '';
  eventType?: AttendanceEventType | '';
  search?: string;
  limit?: number;
}

export async function fetchAttendanceLogs(
  token: string,
  filters?: LogFilters
): Promise<AttendanceLogRecord[]> {
  const params = new URLSearchParams();
  if (filters?.fromDate) params.set('fromDate', filters.fromDate);
  if (filters?.toDate) params.set('toDate', filters.toDate);
  if (filters?.classGrade) params.set('classGrade', String(filters.classGrade));
  if (filters?.eventType) params.set('eventType', filters.eventType);
  if (filters?.search) params.set('search', filters.search);
  if (filters?.limit) params.set('limit', String(filters.limit));

  const qs = params.toString();
  const data = await authFetch<{ logs: AttendanceLogRecord[] }>(
    `/api/logs${qs ? `?${qs}` : ''}`,
    token
  );
  return data.logs;
}

export async function downloadCsvReport(
  token: string,
  filters?: LogFilters
): Promise<void> {
  const params = new URLSearchParams();
  if (filters?.fromDate) params.set('fromDate', filters.fromDate);
  if (filters?.toDate) params.set('toDate', filters.toDate);
  if (filters?.classGrade) params.set('classGrade', String(filters.classGrade));
  if (filters?.eventType) params.set('eventType', filters.eventType);
  if (filters?.search) params.set('search', filters.search);

  const qs = params.toString();
  const res = await fetch(`/api/export/csv${qs ? `?${qs}` : ''}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error('Failed to export CSV report.');
  }

  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match ? match[1] : 'arafa-attendance-report.csv';

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function fetchDevices(token: string): Promise<RfidDeviceRecord[]> {
  const data = await authFetch<{ devices: RfidDeviceRecord[] }>(
    '/api/devices',
    token
  );
  return data.devices;
}

export async function createDevice(
  token: string,
  payload: { deviceCode: string; locationName: string }
): Promise<RfidDeviceRecord> {
  const data = await authFetch<{ device: RfidDeviceRecord }>(
    '/api/devices',
    token,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
  return data.device;
}

export async function removeDevice(token: string, id: number): Promise<void> {
  await authFetch<{ deleted: boolean }>(`/api/devices/${id}`, token, {
    method: 'DELETE',
  });
}

export async function simulateHardwareScan(
  token: string,
  rfidUid: string,
  deviceCode: string
): Promise<any> {
  return authFetch('/api/rfid/simulate', token, {
    method: 'POST',
    body: JSON.stringify({ rfidUid, deviceCode }),
  });
}

export async function fetchLiveAttendanceState(token: string): Promise<{
  students: StudentRecord[];
  logs: AttendanceLogRecord[];
  latestUnregistered: {
    rfidUid: string;
    deviceCode: string;
    scannedAt: string;
  } | null;
}> {
  return authFetch('/api/rfid/live-state', token);
}

export async function dismissUnregisteredScanApi(token: string): Promise<void> {
  await authFetch('/api/rfid/dismiss-unregistered', token, {
    method: 'POST',
  });
}

export async function checkHardwareEndpointUrl(
  token: string,
  origin: string
): Promise<{ reachable: boolean; statusCode: number; reason: string }> {
  const params = new URLSearchParams({ origin });
  return authFetch(`/api/hardware/check-endpoint?${params.toString()}`, token);
}

export async function resetAttendanceLogsApi(
  token: string
): Promise<{ reset: boolean; deletedCount: number }> {
  return authFetch('/api/logs/reset', token, {
    method: 'POST',
  });
}
