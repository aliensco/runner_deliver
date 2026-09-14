import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import type { CookieOptions, RequestHandler } from "express";
import type { AppConfig } from "./config";
import type { SqliteDatabase } from "./db";
import { nowIso } from "./db";
import { AppError } from "./errors";

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: "admin" | "merchant" | "rider";
  display_name: string;
  merchant_id: number | null;
  rider_id: number | null;
  active: number;
}

export function sessionCookieOptions(config: AppConfig): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: config.sessionCookieSecure,
    path: config.sessionCookiePath,
    maxAge: config.sessionTtlHours * 60 * 60 * 1000
  };
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function publicUser(row: UserRow): NonNullable<Express.Request["auth"]> {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    displayName: row.display_name,
    merchantId: row.merchant_id,
    riderId: row.rider_id
  };
}

export async function authenticateCredentials(
  db: SqliteDatabase,
  username: string,
  password: string
): Promise<NonNullable<Express.Request["auth"]>> {
  const row = db
    .prepare(
      `SELECT u.*
       FROM users u
       LEFT JOIN merchants m ON m.id = u.merchant_id
       LEFT JOIN riders r ON r.id = u.rider_id
       WHERE u.username = ? AND u.active = 1
         AND (
           u.role = 'admin' OR
           (u.role = 'merchant' AND m.active = 1) OR
           (u.role = 'rider' AND r.active = 1)
         )`
    )
    .get(username) as UserRow | undefined;

  if (!row || !(await bcrypt.compare(password, row.password_hash))) {
    throw new AppError(401, "Invalid username or password", "INVALID_CREDENTIALS");
  }
  return publicUser(row);
}

export function createSession(
  db: SqliteDatabase,
  config: AppConfig,
  userId: number
): string {
  const token = randomBytes(32).toString("base64url");
  const createdAt = nowIso();
  const expiresAt = new Date(
    Date.now() + config.sessionTtlHours * 60 * 60 * 1000
  ).toISOString();
  const result = db
    .prepare(
      `INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
       SELECT ?, u.id, ?, ?
       FROM users u
       LEFT JOIN merchants m ON m.id = u.merchant_id
       LEFT JOIN riders r ON r.id = u.rider_id
       WHERE u.id = ? AND u.active = 1
         AND (
           u.role = 'admin' OR
           (u.role = 'merchant' AND m.active = 1) OR
           (u.role = 'rider' AND r.active = 1)
         )`
    )
    .run(hashSessionToken(token), expiresAt, createdAt, userId);
  if (result.changes !== 1) {
    throw new AppError(401, "Account is inactive", "ACCOUNT_INACTIVE");
  }
  return token;
}

export function deleteSession(db: SqliteDatabase, token: string | undefined): void {
  if (!token) return;
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashSessionToken(token));
}

export function requireAuth(
  db: SqliteDatabase,
  config: AppConfig
): RequestHandler {
  return (req, _res, next) => {
    const token = req.cookies?.[config.sessionCookieName] as string | undefined;
    if (!token) {
      next(new AppError(401, "Authentication required", "AUTH_REQUIRED"));
      return;
    }

    const row = db
      .prepare(
        `SELECT u.*
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         LEFT JOIN merchants m ON m.id = u.merchant_id
         LEFT JOIN riders r ON r.id = u.rider_id
         WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1
           AND (
             u.role = 'admin' OR
             (u.role = 'merchant' AND m.active = 1) OR
             (u.role = 'rider' AND r.active = 1)
           )`
      )
      .get(hashSessionToken(token), nowIso()) as UserRow | undefined;
    if (!row) {
      deleteSession(db, token);
      next(new AppError(401, "Session is invalid or expired", "SESSION_INVALID"));
      return;
    }

    req.auth = publicUser(row);
    next();
  };
}

export function requireRoles(
  ...roles: Array<"admin" | "merchant" | "rider">
): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) {
      next(new AppError(401, "Authentication required", "AUTH_REQUIRED"));
      return;
    }
    if (!roles.includes(req.auth.role)) {
      next(new AppError(403, "You do not have permission for this action", "FORBIDDEN"));
      return;
    }
    next();
  };
}
