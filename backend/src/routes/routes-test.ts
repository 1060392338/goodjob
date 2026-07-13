import { strict as assert } from "node:assert";
import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { registerAuthRoutes } from "./auth-routes.js";
import { registerSystemRoutes } from "./system-routes.js";

const app = express();
app.use(express.json());
registerSystemRoutes(app);
registerAuthRoutes(app, {
  loginLimiter: (_req, _res, next) => next()
});
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof z.ZodError) {
    res.status(400).json({ message: "参数格式错误", issues: error.issues });
    return;
  }
  res.status(500).json({ message: error instanceof Error ? error.message : "服务器内部错误" });
});

const server = app.listen(0);
const address = server.address();
if (!address || typeof address === "string") throw new Error("Cannot start route integration test server");
const baseUrl = `http://127.0.0.1:${address.port}`;

async function request(path: string, options: RequestInit = {}) {
  const response = await fetch(baseUrl + path, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) }
  });
  return { response, json: await response.json() as Record<string, any> };
}

try {
  const health = await request("/api/health");
  assert.equal(health.response.status, 200);
  assert.deepEqual(health.json, { ok: true, store: "memory" });

  const malformed = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "not-an-email", password: "x" })
  });
  assert.equal(malformed.response.status, 400);

  const invalid = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "shirley@goodjob.com", password: "wrong-password" })
  });
  assert.equal(invalid.response.status, 401);
  assert.equal(invalid.json.message, "账号或密码错误");

  const login = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "SHIRLEY@GOODJOB.COM", password: "goodjob123" })
  });
  assert.equal(login.response.status, 200);
  assert.equal(login.response.headers.get("cache-control"), "no-store");
  assert.equal(login.json.user.email, "shirley@goodjob.com");
  assert.ok(login.json.token);
  assert.ok(login.json.csrfToken);
  assert.match(login.response.headers.get("set-cookie") || "", /gj_session=/);

  const me = await request("/api/auth/me", {
    headers: { authorization: `Bearer ${login.json.token}` }
  });
  assert.equal(me.response.status, 200);
  assert.equal(me.response.headers.get("cache-control"), "no-store");
  assert.equal(me.json.user.id, "u_sales_shirley");

  const unauthenticated = await request("/api/auth/me");
  assert.equal(unauthenticated.response.status, 401);

  const logout = await request("/api/auth/logout", { method: "POST" });
  assert.equal(logout.response.status, 200);
  assert.equal(logout.response.headers.get("cache-control"), "no-store");
  assert.equal(logout.json.ok, true);

  console.log(JSON.stringify({
    ok: true,
    systemRoutes: ["GET /api/health"],
    authRoutes: ["POST /api/auth/login", "POST /api/auth/logout", "GET /api/auth/me"],
    malformedLogin: malformed.response.status,
    invalidLogin: invalid.response.status,
    authenticatedMe: me.response.status
  }, null, 2));
} finally {
  server.close();
}
