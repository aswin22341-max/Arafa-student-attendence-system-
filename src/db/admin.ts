import crypto from 'node:crypto';
import { count, eq } from 'drizzle-orm';
import { db } from './index.ts';
import { adminAccounts } from './schema.ts';
import { hashPassword, verifyPassword } from '../utils/adminAuth.ts';

export function getSessionSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16) {
    return process.env.SESSION_SECRET;
  }
  const seed = process.env.SQL_PASSWORD || 'arafa-english-school-session-key';
  return crypto.createHash('sha256').update(seed).digest('hex');
}

async function ensureDefaultAdminAccount(): Promise<void> {
  const [{ total }] = await db
    .select({ total: count() })
    .from(adminAccounts);

  if (Number(total) === 0) {
    const defaultUsername = (process.env.ADMIN_USERNAME || 'admin')
      .trim()
      .toLowerCase();
    const defaultPassword = process.env.ADMIN_PASSWORD || 'Arafa@2026';

    await db
      .insert(adminAccounts)
      .values({
        username: defaultUsername,
        passwordHash: hashPassword(defaultPassword),
        fullName: 'School Administrator',
      })
      .onConflictDoNothing();
  }
}

export async function authenticateAdmin(
  usernameInput: string,
  passwordInput: string
): Promise<{ id: number; username: string; fullName: string } | null> {
  try {
    await ensureDefaultAdminAccount();
    const normalized = usernameInput.trim().toLowerCase();
    if (!normalized || !passwordInput) return null;

    const [admin] = await db
      .select()
      .from(adminAccounts)
      .where(eq(adminAccounts.username, normalized))
      .limit(1);

    if (!admin) return null;
    if (!verifyPassword(passwordInput, admin.passwordHash)) return null;

    return {
      id: admin.id,
      username: admin.username,
      fullName: admin.fullName,
    };
  } catch (error) {
    console.error('Database query failed in authenticateAdmin:', error);
    throw new Error('Authentication service unavailable.', { cause: error });
  }
}

export async function updateAdminPassword(
  adminId: number,
  currentPassword: string,
  newPassword: string
): Promise<boolean> {
  try {
    const [admin] = await db
      .select()
      .from(adminAccounts)
      .where(eq(adminAccounts.id, adminId))
      .limit(1);

    if (!admin) return false;
    if (!verifyPassword(currentPassword, admin.passwordHash)) return false;

    await db
      .update(adminAccounts)
      .set({
        passwordHash: hashPassword(newPassword),
        updatedAt: new Date(),
      })
      .where(eq(adminAccounts.id, adminId));

    return true;
  } catch (error) {
    console.error('Database query failed in updateAdminPassword:', error);
    throw new Error('Failed to update administrator password.', { cause: error });
  }
}
