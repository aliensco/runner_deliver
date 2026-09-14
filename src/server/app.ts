import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import fs from "node:fs";
import path from "node:path";
import type { AppConfig } from "./config";
import { loadConfig } from "./config";
import { openDatabase, type SqliteDatabase } from "./db";
import { errorHandler, notFoundHandler } from "./errors";
import { requireAuth } from "./auth";
import { seedDemoData } from "./seed";
import { authRouter } from "./routes/auth";
import { dashboardRouter } from "./routes/dashboard";
import { ledgerRouter } from "./routes/ledger";
import { merchantsRouter } from "./routes/merchants";
import { ordersRouter } from "./routes/orders";
import { pricingRulesRouter } from "./routes/pricingRules";
import { ridersRouter } from "./routes/riders";
import { settingsRouter } from "./routes/settings";
import { parcelDemoRouter } from "./routes/parcelDemo";

export interface Application {
  app: Express;
  db: SqliteDatabase;
  config: AppConfig;
}

export function createApplication(overrides: Partial<AppConfig> = {}): Application {
  const config = loadConfig(overrides);
  const db = openDatabase(config.databasePath);
  if (config.seedDemoData) seedDemoData(db, config);

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.use("/api/auth", authRouter(db, config));
  app.use("/api/integrations/parcel-demo", parcelDemoRouter(db, config));

  app.use("/api", requireAuth(db, config));
  app.use("/api/dashboard", dashboardRouter(db));
  app.use("/api/orders", ordersRouter(db));
  app.use("/api/merchants", merchantsRouter(db));
  app.use("/api/riders", ridersRouter(db));
  app.use("/api/pricing-rules", pricingRulesRouter(db));
  app.use("/api/ledger", ledgerRouter(db));
  app.use("/api/settings", settingsRouter(db));

  // Keep unknown API routes JSON-only, then serve the compiled SPA when present.
  app.use("/api", notFoundHandler);
  const clientDirectory = path.resolve(process.cwd(), "dist/client");
  const clientIndex = path.join(clientDirectory, "index.html");
  if (fs.existsSync(clientIndex)) {
    app.use(express.static(clientDirectory));
    app.use((req, res, next) => {
      if (req.method === "GET" && req.accepts("html")) {
        res.sendFile(clientIndex);
        return;
      }
      next();
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return { app, db, config };
}
