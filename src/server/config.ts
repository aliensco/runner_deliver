import path from "node:path";

export interface AppConfig {
  host: string;
  port: number;
  databasePath: string;
  sessionCookieName: string;
  sessionCookieSecure: boolean;
  sessionTtlHours: number;
  bcryptRounds: number;
  seedDemoData: boolean;
  demoPassword: string;
}

export const defaultDemoPassword = "DemoOnly123!";

function booleanFromEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true";
}

function numberFromEnv(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!value.trim()) throw new Error(`${name} must be a number`);
  return Number(value);
}

function assertIntegerInRange(
  name: string,
  value: number,
  minimum: number,
  maximum: number
): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    /^127(?:\.\d{1,3}){3}$/.test(normalized)
  );
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const configuredPath = process.env.DATABASE_PATH ?? "./data/runner-deliver.db";
  const config: AppConfig = {
    host: process.env.HOST?.trim() || "127.0.0.1",
    port: numberFromEnv("PORT", process.env.PORT, 3000),
    databasePath:
      configuredPath === ":memory:" ? configuredPath : path.resolve(configuredPath),
    sessionCookieName: "runner_session",
    sessionCookieSecure: booleanFromEnv(process.env.SESSION_COOKIE_SECURE, false),
    sessionTtlHours: numberFromEnv("SESSION_TTL_HOURS", process.env.SESSION_TTL_HOURS, 168),
    bcryptRounds: numberFromEnv("BCRYPT_ROUNDS", process.env.BCRYPT_ROUNDS, 10),
    seedDemoData: booleanFromEnv(process.env.SEED_DEMO_DATA, true),
    demoPassword: process.env.DEMO_PASSWORD ?? defaultDemoPassword,
    ...overrides
  };

  if (!config.host.trim()) throw new Error("HOST must not be empty");
  assertIntegerInRange("PORT", config.port, 0, 65_535);
  assertIntegerInRange("SESSION_TTL_HOURS", config.sessionTtlHours, 1, 24 * 365 * 10);
  assertIntegerInRange("BCRYPT_ROUNDS", config.bcryptRounds, 4, 31);
  if (config.demoPassword.length < 1) {
    throw new Error("DEMO_PASSWORD must not be empty");
  }
  if (
    config.seedDemoData &&
    !isLoopbackHost(config.host) &&
    config.demoPassword === defaultDemoPassword
  ) {
    throw new Error(
      "Refusing to expose seeded demo accounts on a non-loopback host with the default password"
    );
  }
  return config;
}
