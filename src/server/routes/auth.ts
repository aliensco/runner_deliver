import { Router } from "express";
import { z } from "zod";
import {
  authenticateCredentials,
  createSession,
  deleteSession,
  requireAuth,
  sessionCookieOptions
} from "../auth";
import type { AppConfig } from "../config";
import type { SqliteDatabase } from "../db";

const loginSchema = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(200)
});

export function authRouter(db: SqliteDatabase, config: AppConfig): Router {
  const router = Router();

  router.post("/login", async (req, res) => {
    const input = loginSchema.parse(req.body);
    const user = await authenticateCredentials(db, input.username, input.password);
    const token = createSession(db, config, user.id);
    res.cookie(config.sessionCookieName, token, sessionCookieOptions(config));
    res.json({ user });
  });

  router.post("/logout", (req, res) => {
    const token = req.cookies?.[config.sessionCookieName] as string | undefined;
    deleteSession(db, token);
    res.clearCookie(config.sessionCookieName, {
      ...sessionCookieOptions(config),
      maxAge: undefined
    });
    res.status(204).end();
  });

  router.get("/me", requireAuth(db, config), (req, res) => {
    res.json({ user: req.auth });
  });

  return router;
}
