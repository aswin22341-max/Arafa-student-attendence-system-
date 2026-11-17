import type { Request, Response, NextFunction } from 'express';
import { getSessionSecret } from '../db/admin.ts';
import {
  verifySessionToken,
  type AdminSessionPayload,
} from '../utils/adminAuth.ts';

export interface AuthRequest extends Request {
  admin?: AdminSessionPayload;
}

export const requireAuth = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing session token' });
  }

  const token = authHeader.split('Bearer ')[1];
  const session = verifySessionToken(token, getSessionSecret());
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired session' });
  }

  req.admin = session;
  next();
};
