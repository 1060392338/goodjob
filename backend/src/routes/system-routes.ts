import type { Application } from "express";
import { getStore } from "../store.js";

export function registerSystemRoutes(app: Application) {
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, store: getStore().mode });
  });
}
