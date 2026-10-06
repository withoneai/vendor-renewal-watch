import { DEMO, LOOKBACK_MONTHS, WATCH_DAYS, loadPolicy, slackConfigured } from "./config.js";
import { probeQuickBooks } from "./quickbooks.js";
import { probeNotion } from "./notion.js";

/**
 * Proves the run will work before you rely on it: the policy file parses,
 * and (live only) both connections answer.
 */
let failed = false;

try {
  const policy = loadPolicy();
  const rules = policy.split("\n").filter((l) => l.startsWith("- ")).length;
  console.log(`✓ config/renewal-policy.md parses (${rules} policy lines for the model to apply)`);
  console.log(`✓ reading ${LOOKBACK_MONTHS} months of spend, judging renewals inside ${WATCH_DAYS} days`);

  if (DEMO) {
    console.log("\nNo keys in the environment, so neither connection was probed.");
    console.log("This clone will run `npm start` in demo mode: recorded books, real pipeline.");
  } else {
    const company = await probeQuickBooks();
    console.log(`✓ QuickBooks answers (${company})`);
    const rows = await probeNotion();
    console.log(`✓ Notion inventory answers (${rows} row${rows === 1 ? "" : "s"} on the first page)`);
    console.log(slackConfigured() ? "✓ Slack brief configured" : "· Slack brief not configured (optional)");
  }
} catch (err) {
  console.error(`✗ ${err instanceof Error ? err.message : err}`);
  failed = true;
}

process.exit(failed ? 1 : 0);
