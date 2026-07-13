import type { Application, RequestHandler } from "express";
import { z } from "zod";
import {
  AUTH_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  createCsrfToken,
  csrfCookieOptions,
  hashPassword,
  publicUser,
  requireAuth,
  sessionCookieOptions,
  signToken,
  verifyPassword
} from "../auth.js";
import { asyncRoute } from "../http/async-route.js";
import { getStore } from "../store.js";

export interface AuthRouteDependencies {
  loginLimiter: RequestHandler;
}

const loginSchema = z.object({
  email: z.string().trim().email().max(180).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128)
});

export function registerAuthRoutes(app: Application, { loginLimiter }: AuthRouteDependencies) {
  app.post("/api/auth/login", loginLimiter, asyncRoute(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const store = getStore();
    const user = store.users.find((item) => item.email.toLowerCase() === body.email && item.status === "active");
    const passwordCheck = user ? await verifyPassword(user.password, body.password) : { valid: false, needsUpgrade: false };
    if (!user || !passwordCheck.valid) {
      res.status(401).json({ message: "账号或密码错误" });
      return;
    }
    if (passwordCheck.needsUpgrade) {
      user.password = await hashPassword(body.password);
      user.authVersion = user.authVersion || 1;
      await store.persist();
    }
    const sessionUser = publicUser(user);
    const token = signToken(sessionUser);
    const csrfToken = createCsrfToken();
    res.cookie(AUTH_COOKIE_NAME, token, sessionCookieOptions());
    res.cookie(CSRF_COOKIE_NAME, csrfToken, csrfCookieOptions());
    res.setHeader("Cache-Control", "no-store");
    res.json({ token, csrfToken, user: sessionUser });
  }));

  app.post("/api/auth/logout", (_req, res) => {
    res.clearCookie(AUTH_COOKIE_NAME, { ...sessionCookieOptions(), maxAge: undefined });
    res.clearCookie(CSRF_COOKIE_NAME, { ...csrfCookieOptions(), maxAge: undefined });
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true });
  });

  app.get("/api/auth/me", requireAuth, (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ user: req.user });
  });
}
