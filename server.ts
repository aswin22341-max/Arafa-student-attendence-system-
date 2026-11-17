import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import {
  authenticateAdmin,
  getSessionSecret,
  updateAdminPassword,
} from './src/db/admin.ts';
import { requireAuth, type AuthRequest } from './src/middleware/auth.ts';
import {
  createStudent,
  deleteRfidDevice,
  deleteStudent,
  listAttendanceLogs,
  listRfidDevices,
  listStudents,
  processRfidScan,
  registerRfidDevice,
  resetAttendanceLogs,
  updateStudent,
  verifyDeviceApiKey,
} from './src/db/attendance.ts';
import { signSessionToken, verifySessionToken } from './src/utils/adminAuth.ts';
import {
  formatScanDate,
  generateAttendanceCsv,
  normalizeRfidUid,
  validateStudentEnrollment,
} from './src/utils/attendanceLogic.ts';
import type { AttendanceEventType } from './src/types/attendance.ts';

const PORT = Number(process.env.PORT) || 3000;
const app = express();
const server = http.createServer(app);

app.use(express.json({ limit: '1mb' }));

// HTTPS Server-Sent Events (SSE) broadcast hub for gate scan updates
const sseClients = new Set<express.Response>();

let latestUnregisteredScan: {
  rfidUid: string;
  deviceCode: string;
  scannedAt: string;
  recordedAtMs: number;
} | null = null;

// Keep SSE connections alive across reverse proxies
const streamHeartbeat = setInterval(() => {
  for (const res of sseClients) {
    try {
      res.write(': keepalive\n\n');
    } catch {
      sseClients.delete(res);
    }
  }
}, 20_000);

server.on('close', () => {
  clearInterval(streamHeartbeat);
});

function broadcastEvent(payload: unknown) {
  const sseFrame = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(sseFrame);
    } catch {
      sseClients.delete(res);
    }
  }
}

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Admin Login & Session Endpoints
app.post('/api/auth/login', async (req, res) => {
  try {
    const username = String(req.body?.username || '');
    const password = String(req.body?.password || '');

    if (!username.trim() || !password) {
      return res
        .status(400)
        .json({ error: 'Username and password are required.' });
    }

    const admin = await authenticateAdmin(username, password);
    if (!admin) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const token = signSessionToken(
      {
        adminId: admin.id,
        username: admin.username,
        fullName: admin.fullName,
      },
      getSessionSecret()
    );

    return res.json({ token, admin });
  } catch (error: any) {
    console.error('Admin login error:', error);
    return res
      .status(500)
      .json({ error: error.message || 'Login failed.' });
  }
});

app.get('/api/auth/me', requireAuth, (req: AuthRequest, res) => {
  res.json({
    admin: {
      id: req.admin!.adminId,
      username: req.admin!.username,
      fullName: req.admin!.fullName,
    },
  });
});

app.post(
  '/api/auth/change-password',
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const currentPassword = String(req.body?.currentPassword || '');
      const newPassword = String(req.body?.newPassword || '');

      if (!currentPassword || newPassword.length < 6) {
        return res.status(400).json({
          error: 'New password must be at least 6 characters long.',
        });
      }

      const updated = await updateAdminPassword(
        req.admin!.adminId,
        currentPassword,
        newPassword
      );
      if (!updated) {
        return res
          .status(400)
          .json({ error: 'Current password is incorrect.' });
      }

      return res.json({ updated: true });
    } catch (error: any) {
      return res
        .status(500)
        .json({ error: error.message || 'Could not update password.' });
    }
  }
);

// Allow CORS for hardware/local test endpoints
app.options('/api/rfid/scan', (_req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-device-key');
  res.status(204).end();
});

// Real-time Server-Sent Events (SSE) stream over standard HTTPS (works through all proxies)
app.get('/api/rfid/stream', requireAuth, (req: AuthRequest, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  sseClients.add(res);
  res.write(`data: ${JSON.stringify({ type: 'auth:ok' })}\n\n`);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// Live state fallback endpoint for dashboards (ensures real-time sync even if stream reconnects)
app.get('/api/rfid/live-state', requireAuth, async (_req: AuthRequest, res) => {
  try {
    const [students, logs] = await Promise.all([
      listStudents(),
      listAttendanceLogs({ limit: 100 }),
    ]);

    const activeUnregistered =
      latestUnregisteredScan &&
      Date.now() - latestUnregisteredScan.recordedAtMs < 4_000
        ? {
            rfidUid: latestUnregisteredScan.rfidUid,
            deviceCode: latestUnregisteredScan.deviceCode,
            scannedAt: latestUnregisteredScan.scannedAt,
          }
        : null;

    res.json({
      students,
      logs,
      latestUnregistered: activeUnregistered,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to sync live state.' });
  }
});

// Check whether a target WiFi server origin is publicly reachable by ESP8266
app.get('/api/hardware/check-endpoint', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rawOrigin = String(req.query.origin || '').trim().replace(/\/+$/, '');
    let parsed: URL;
    try {
      parsed = new URL(rawOrigin);
    } catch {
      return res.json({
        reachable: false,
        statusCode: 0,
        reason: 'Enter a valid http:// or https:// base URL.',
      });
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return res.json({
        reachable: false,
        statusCode: 0,
        reason: 'Only http:// or https:// URLs are supported.',
      });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const probe = await fetch(`${parsed.origin}/api/health`, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (probe.status === 200) {
        return res.json({
          reachable: true,
          statusCode: 200,
          reason: 'Reachable by WiFi ESP8266 devices.',
        });
      }
      if (probe.status === 302 || probe.status === 301 || probe.status === 401 || probe.status === 403) {
        return res.json({
          reachable: false,
          statusCode: probe.status,
          reason:
            'Blocked by preview authentication (HTTP ' +
            probe.status +
            '). Publish/Share the app to use WiFi mode, or use Direct USB Reader.',
        });
      }
      if (probe.status === 404) {
        return res.json({
          reachable: false,
          statusCode: 404,
          reason:
            'Shared App URL is not published yet (HTTP 404). Click Share/Deploy in AI Studio first, or use Direct USB Reader right now.',
        });
      }
      return res.json({
        reachable: false,
        statusCode: probe.status,
        reason: `Server responded with HTTP ${probe.status}.`,
      });
    } catch {
      clearTimeout(timer);
      return res.json({
        reachable: false,
        statusCode: 0,
        reason: 'Could not connect to that URL from the server.',
      });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Endpoint check failed.' });
  }
});

app.post('/api/rfid/dismiss-unregistered', requireAuth, (_req: AuthRequest, res) => {
  latestUnregisteredScan = null;
  res.json({ dismissed: true });
});

// ESP8266 Hardware Scan Endpoint (Authenticated by Device API Key)
app.post('/api/rfid/scan', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const rawRfidUid = String(
      req.body?.rfidUid ??
        req.body?.uid ??
        req.body?.rfid_uid ??
        req.body?.cardUid ??
        req.query?.rfidUid ??
        req.query?.uid ??
        ''
    );
    const requestedDeviceCode = String(
      req.body?.deviceCode ?? req.body?.device_code ?? req.query?.deviceCode ?? ''
    )
      .trim()
      .toUpperCase();
    const deviceKey = String(
      req.headers['x-device-key'] ||
        req.body?.deviceKey ||
        req.query?.deviceKey ||
        ''
    ).trim();

    if (!deviceKey) {
      return res.status(401).json({
        error: 'Missing x-device-key authentication header.',
      });
    }

    const verifiedDeviceCode = await verifyDeviceApiKey(
      requestedDeviceCode,
      deviceKey
    );
    if (!verifiedDeviceCode) {
      return res.status(401).json({ error: 'Invalid ESP8266 device credentials.' });
    }

    const normalized = normalizeRfidUid(rawRfidUid);
    if (!normalized || normalized.length < 4) {
      return res.status(400).json({ error: 'Invalid RFID UID payload.' });
    }

    const outcome = await processRfidScan({
      rawRfidUid: normalized,
      deviceCode: verifiedDeviceCode,
    });

    if (outcome.status === 'unregistered') {
      latestUnregisteredScan = {
        rfidUid: outcome.rfidUid,
        deviceCode: outcome.deviceCode,
        scannedAt: outcome.scannedAt,
        recordedAtMs: Date.now(),
      };
      broadcastEvent({
        type: 'rfid:unregistered',
        rfidUid: outcome.rfidUid,
        deviceCode: outcome.deviceCode,
        scannedAt: outcome.scannedAt,
        log: outcome.log,
      });
      return res.status(202).json(outcome);
    }

    if (outcome.status === 'debounced') {
      return res.status(200).json({
        status: 'debounced',
        remainingMs: outcome.remainingMs,
        studentName: outcome.student.fullName,
      });
    }

    latestUnregisteredScan = null;
    broadcastEvent({
      type: 'attendance:scan',
      student: outcome.student,
      log: outcome.log,
    });

    return res.status(200).json({
      status: 'logged',
      eventType: outcome.log.eventType,
      studentName: outcome.student.fullName,
      classGrade: outcome.student.classGrade,
      section: outcome.student.section,
      rollNumber: outcome.student.rollNumber,
      scannedAt: outcome.log.scannedAt,
    });
  } catch (error: any) {
    console.error('Failed to process ESP8266 RFID scan:', error);
    return res
      .status(500)
      .json({ error: error.message || 'Failed to process RFID scan.' });
  }
});

// Admin Authenticated Test Scan & USB Serial Bridge Endpoint (triggers exact same pipeline)
app.post('/api/rfid/simulate', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rawRfidUid = String(
      req.body?.rfidUid ?? req.body?.uid ?? req.body?.rfid_uid ?? ''
    );
    const deviceCode = String(req.body?.deviceCode || 'GATE-ESP8266-01')
      .trim()
      .toUpperCase();

    const normalized = normalizeRfidUid(rawRfidUid);
    if (!normalized || normalized.length < 4) {
      return res.status(400).json({ error: 'Invalid RFID UID.' });
    }

    const outcome = await processRfidScan({
      rawRfidUid: normalized,
      deviceCode,
    });

    if (outcome.status === 'unregistered') {
      latestUnregisteredScan = {
        rfidUid: outcome.rfidUid,
        deviceCode: outcome.deviceCode,
        scannedAt: outcome.scannedAt,
        recordedAtMs: Date.now(),
      };
      broadcastEvent({
        type: 'rfid:unregistered',
        rfidUid: outcome.rfidUid,
        deviceCode: outcome.deviceCode,
        scannedAt: outcome.scannedAt,
        log: outcome.log,
      });
      return res.status(202).json(outcome);
    }

    if (outcome.status === 'debounced') {
      return res.status(200).json({
        status: 'debounced',
        remainingMs: outcome.remainingMs,
        studentName: outcome.student.fullName,
      });
    }

    latestUnregisteredScan = null;
    broadcastEvent({
      type: 'attendance:scan',
      student: outcome.student,
      log: outcome.log,
    });

    return res.status(200).json(outcome);
  } catch (error: any) {
    console.error('Failed to run scan test:', error);
    return res.status(500).json({ error: error.message || 'Failed to run scan test.' });
  }
});

// Student Enrollment & Directory APIs
app.get('/api/students', requireAuth, async (req: AuthRequest, res) => {
  try {
    const classGrade = req.query.classGrade
      ? Number(req.query.classGrade)
      : undefined;
    const search =
      typeof req.query.search === 'string' ? req.query.search : undefined;
    const rows = await listStudents({ classGrade, search });
    res.json({ students: rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load students.' });
  }
});

app.post('/api/students', requireAuth, async (req: AuthRequest, res) => {
  try {
    const validation = validateStudentEnrollment(req.body || {});
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Validation failed.',
        fieldErrors: validation.errors,
      });
    }

    const student = await createStudent({
      ...req.body,
      classGrade: Number(req.body.classGrade),
      normalizedRfidUid: validation.normalizedRfidUid,
      normalizedSection: validation.normalizedSection,
      enrolledByUid: `admin:${req.admin!.username}`,
    });

    if (latestUnregisteredScan?.rfidUid === student.rfidUid) {
      latestUnregisteredScan = null;
    }

    broadcastEvent({ type: 'student:enrolled', student });
    return res.status(201).json({ student });
  } catch (error: any) {
    const status = error?.message?.includes('already assigned') ? 409 : 500;
    return res.status(status).json({ error: error.message || 'Failed to enroll student.' });
  }
});

app.put('/api/students/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const studentId = Number(req.params.id);
    if (!Number.isInteger(studentId) || studentId <= 0) {
      return res.status(400).json({ error: 'Invalid student ID.' });
    }

    const validation = validateStudentEnrollment(req.body || {});
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Validation failed.',
        fieldErrors: validation.errors,
      });
    }

    const updated = await updateStudent(studentId, {
      ...req.body,
      classGrade: Number(req.body.classGrade),
      normalizedRfidUid: validation.normalizedRfidUid,
      normalizedSection: validation.normalizedSection,
    });

    if (!updated) {
      return res.status(404).json({ error: 'Student not found.' });
    }

    broadcastEvent({ type: 'student:updated', student: updated });
    return res.json({ student: updated });
  } catch (error: any) {
    const status = error?.message?.includes('already assigned') ? 409 : 500;
    return res.status(status).json({ error: error.message || 'Failed to update student.' });
  }
});

app.delete('/api/students/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const studentId = Number(req.params.id);
    if (!Number.isInteger(studentId) || studentId <= 0) {
      return res.status(400).json({ error: 'Invalid student ID.' });
    }

    const deleted = await deleteStudent(studentId);
    if (!deleted) {
      return res.status(404).json({ error: 'Student not found.' });
    }

    broadcastEvent({ type: 'student:deleted', studentId });
    return res.json({ deleted: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to delete student.' });
  }
});

// Historical Attendance Logs & Teacher CSV Export
app.get('/api/logs', requireAuth, async (req: AuthRequest, res) => {
  try {
    const fromDate =
      typeof req.query.fromDate === 'string' && req.query.fromDate
        ? req.query.fromDate
        : undefined;
    const toDate =
      typeof req.query.toDate === 'string' && req.query.toDate
        ? req.query.toDate
        : undefined;
    const classGrade = req.query.classGrade
      ? Number(req.query.classGrade)
      : undefined;
    const eventType =
      req.query.eventType === 'ENTRY' ||
      req.query.eventType === 'EXIT' ||
      req.query.eventType === 'UNKNOWN'
        ? (req.query.eventType as AttendanceEventType)
        : undefined;
    const search =
      typeof req.query.search === 'string' ? req.query.search : undefined;
    const limit = req.query.limit ? Math.min(Number(req.query.limit), 1000) : 300;

    const logs = await listAttendanceLogs({
      fromDate,
      toDate,
      classGrade,
      eventType,
      search,
      limit,
    });

    res.json({ logs });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load logs.' });
  }
});

app.post('/api/logs/reset', requireAuth, async (_req: AuthRequest, res) => {
  try {
    const deletedCount = await resetAttendanceLogs();
    latestUnregisteredScan = null;
    broadcastEvent({ type: 'logs:reset', deletedCount });
    res.json({ reset: true, deletedCount });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to reset attendance logs.' });
  }
});

app.get('/api/export/csv', requireAuth, async (req: AuthRequest, res) => {
  try {
    const fromDate =
      typeof req.query.fromDate === 'string' && req.query.fromDate
        ? req.query.fromDate
        : undefined;
    const toDate =
      typeof req.query.toDate === 'string' && req.query.toDate
        ? req.query.toDate
        : undefined;
    const classGrade = req.query.classGrade
      ? Number(req.query.classGrade)
      : undefined;
    const eventType =
      req.query.eventType === 'ENTRY' ||
      req.query.eventType === 'EXIT' ||
      req.query.eventType === 'UNKNOWN'
        ? (req.query.eventType as AttendanceEventType)
        : undefined;
    const search =
      typeof req.query.search === 'string' ? req.query.search : undefined;

    const logs = await listAttendanceLogs({
      fromDate,
      toDate,
      classGrade,
      eventType,
      search,
      limit: 10000,
    });

    const csv = generateAttendanceCsv(logs);
    const filenameDate = fromDate || formatScanDate(new Date());
    const gradeLabel = classGrade ? `-class-${classGrade}` : '-all-classes';

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="arafa-attendance${gradeLabel}-${filenameDate}.csv"`
    );
    res.send(csv);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to generate CSV report.' });
  }
});

// ESP8266 Reader Hardware Management APIs
app.get('/api/devices', requireAuth, async (_req: AuthRequest, res) => {
  try {
    const devices = await listRfidDevices();
    res.json({ devices });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load devices.' });
  }
});

app.post('/api/devices', requireAuth, async (req: AuthRequest, res) => {
  try {
    const deviceCode = String(req.body?.deviceCode || '').trim();
    const locationName = String(req.body?.locationName || '').trim();
    if (!deviceCode || deviceCode.length < 3 || deviceCode.length > 40) {
      return res
        .status(400)
        .json({ error: 'Device Code must be 3 to 40 characters.' });
    }
    if (!locationName || locationName.length < 2 || locationName.length > 80) {
      return res
        .status(400)
        .json({ error: 'Location name must be 2 to 80 characters.' });
    }

    const device = await registerRfidDevice({
      deviceCode,
      locationName,
      createdByUid: `admin:${req.admin!.username}`,
    });
    return res.status(201).json({ device });
  } catch (error: any) {
    const status = error?.message?.includes('already exists') ? 409 : 500;
    return res.status(status).json({ error: error.message || 'Failed to register device.' });
  }
});

app.delete('/api/devices/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const deviceId = Number(req.params.id);
    if (!Number.isInteger(deviceId) || deviceId <= 0) {
      return res.status(400).json({ error: 'Invalid device ID.' });
    }
    const deleted = await deleteRfidDevice(deviceId);
    if (!deleted) {
      return res.status(404).json({ error: 'Device not found.' });
    }
    return res.json({ deleted: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to delete device.' });
  }
});

app.all('/api/*', (_req, res) => {
  res.status(404).json({ error: 'API endpoint not found.' });
});

// Vite dev middleware or production static bundle
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve('dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Arafa English School Attendance Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
