import "dotenv/config";
import { readFileSync } from "node:fs";
import { One } from "@withone/sdk";

/**
 * Demo mode replays two years of recorded QuickBooks spend and a recorded
 * Notion tool inventory from fixtures/. It turns on two ways: explicitly with
 * --demo, or implicitly when the required keys are absent. The implicit
 * fallback is what makes a fresh clone runnable with zero configuration: the
 * same pipeline runs end to end, only the QuickBooks read, the Notion read,
 * and the Claude calls come from disk instead of the wire.
 */
const KEYS_PRESENT = Boolean(
  process.env.ONE_SECRET &&
    process.env.ANTHROPIC_API_KEY &&
    process.env.ONE_CONNECTION_QUICKBOOKS &&
    process.env.ONE_CONNECTION_NOTION &&
    process.env.QUICKBOOKS_REALM_ID &&
    process.env.NOTION_INVENTORY_DATA_SOURCE_ID,
);

export const DEMO = process.argv.includes("--demo") || !KEYS_PRESENT;
export const DEMO_REASON = process.argv.includes("--demo")
  ? "--demo"
  : KEYS_PRESENT
    ? ""
    : "no keys in the environment";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
    console.error("Or run `npm start -- --demo` to replay the recorded books, no keys needed.");
    process.exit(1);
  }
  return value;
}

let client: One | undefined;
export function oneClient(): One {
  client ??= new One(required("ONE_SECRET"));
  return client;
}

export const connections = {
  quickbooks: () => required("ONE_CONNECTION_QUICKBOOKS"),
  notion: () => required("ONE_CONNECTION_NOTION"),
  slack: () => required("ONE_CONNECTION_SLACK"),
};

export const quickbooksRealmId = () => required("QUICKBOOKS_REALM_ID");
export const inventoryDataSourceId = () => required("NOTION_INVENTORY_DATA_SOURCE_ID");

/** Slack is an optional output: configured means both env lines are set. */
export const slackConfigured = () =>
  Boolean(process.env.ONE_CONNECTION_SLACK && process.env.SLACK_CHANNEL);
export const slackChannel = () => required("SLACK_CHANNEL");

export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-opus-5";

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    console.error(`${name} must be a positive number, not "${raw}".`);
    process.exit(1);
  }
  return value;
}

export const LOOKBACK_MONTHS = numberEnv("LOOKBACK_MONTHS", 24);
export const WATCH_DAYS = numberEnv("WATCH_DAYS", 90);

export function loadFixture(relPath: string): unknown {
  const url = new URL(`../fixtures/${relPath}`, import.meta.url);
  try {
    return JSON.parse(readFileSync(url, "utf8"));
  } catch {
    throw new Error(`No fixture at fixtures/${relPath}.`);
  }
}

/**
 * "Now" for the run. Live, it is the clock. In demo mode it is pinned to the
 * moment the fixtures were captured, so the recorded renewals stay upcoming
 * no matter when you clone the repo.
 */
export function runDate(): Date {
  if (DEMO) {
    const meta = loadFixture("meta.json") as { captured_at: string };
    return new Date(meta.captured_at);
  }
  return new Date();
}

export function loadPolicy(): string {
  return readFileSync(new URL("../config/renewal-policy.md", import.meta.url), "utf8");
}
