import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { schemaSql } from "./schema";

export type SqliteDatabase = Database.Database;

export function openDatabase(filename: string): SqliteDatabase {
  if (filename !== ":memory:") {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
  }

  const db = new Database(filename);
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  if (filename !== ":memory:") {
    db.pragma("journal_mode = WAL");
  }
  db.exec(schemaSql);
  return db;
}

export function nowIso(): string {
  return new Date().toISOString();
}
