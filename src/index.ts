import { DEMO, DEMO_REASON, LOOKBACK_MONTHS, WATCH_DAYS, runDate, slackConfigured } from "./config.js";
import { readCharges } from "./quickbooks.js";
import { readInventory } from "./notion.js";
import { buildVendorFacts, money } from "./recurring.js";
import { judgeVendor } from "./judge.js";
import { briefText, cancelSavings, postBrief, type RunSummary } from "./slack.js";
import type { Judged } from "./types.js";

function parseArgs(argv: string[]): { dryRun: boolean } {
  const args = argv.slice(2);
  if (args.includes("--help")) {
    console.log(
      [
        "Usage:",
        "  npm start                    find recurring vendors, judge the ones renewing soon",
        "  npm start -- --demo          replay the recorded books, no keys, no network",
        "  npm start -- --dry-run       print every decision, post nothing to Slack",
        "",
        "Defaults: 24 months of spend (LOOKBACK_MONTHS), a 90-day watch window (WATCH_DAYS).",
      ].join("\n"),
    );
    process.exit(0);
  }
  return { dryRun: args.includes("--dry-run") };
}

const opts = parseArgs(process.argv);
const now = runDate();
const since = new Date(now);
since.setUTCMonth(since.getUTCMonth() - LOOKBACK_MONTHS);

const demoNote = DEMO ? ` (demo: ${DEMO_REASON}, replaying the recorded books)` : "";
console.log(`── vendor renewal watch${demoNote}\n`);
if (DEMO && DEMO_REASON !== "--demo") {
  console.log("   No keys found, so this replays two years of recorded QuickBooks spend and a");
  console.log("   recorded Notion tool inventory: fictional company, real pipeline.\n");
}

const [charges, inventory] = await Promise.all([readCharges(since), readInventory()]);
const vendors = buildVendorFacts(charges, inventory, now);
const watched = vendors.filter((f) => f.daysUntilDecision <= WATCH_DAYS);
const later = vendors.filter((f) => f.daysUntilDecision > WATCH_DAYS);
const vendorCount = new Set(charges.map((c) => c.vendor)).size;

console.log(
  `${charges.length} charges from ${vendorCount} vendors since ${since.toISOString().slice(0, 10)}, ${inventory.length} tools in the inventory`,
);
console.log(
  `${vendors.length} bill on a schedule; ${watched.length} need a decision in the next ${WATCH_DAYS} days${opts.dryRun ? " (dry run)" : ""}\n`,
);

const judged: Judged[] = [];

for (const facts of watched) {
  const name = facts.inventory?.name ?? facts.vendor;
  const change = facts.priceChangePct ? `, ${facts.priceChangePct > 0 ? "+" : ""}${facts.priceChangePct}% on a year ago` : "";
  console.log(`── ${name}  ${money(facts.annualCost)}/yr, ${facts.cadence}${change}, decide by ${facts.decideBy} (${facts.daysUntilDecision}d)`);

  // The billing-after-cancel gate runs here, in code, before the model is
  // ever asked. The inventory owner already decided; a charge since is a
  // subscription that was never actually turned off, and that is a fact.
  if (facts.billingAfterCancel) {
    const decision = {
      verdict: "cancel" as const,
      reason: `The inventory marks this cancelled, but QuickBooks shows a ${money(facts.lastAmount)} charge on ${facts.lastChargeDate}. The subscription is still live.`,
      ask: `${facts.inventory?.owner ?? "Finance"}: can you cancel it in the vendor's billing settings before ${facts.nextRenewal}?`,
    };
    console.log(`   cancel (forced): ${decision.reason}`);
    judged.push({ facts, decision, forced: true });
    continue;
  }

  try {
    const decision = await judgeVendor(facts);
    console.log(`   ${decision.verdict}: ${decision.reason}`);
    if (decision.ask) console.log(`   ask: ${decision.ask}`);
    judged.push({ facts, decision, forced: false });
  } catch (err) {
    console.error(`   failed: ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  }
}

if (later.length) {
  console.log(`\nFurther out, not judged: ${later.map((f) => `${f.inventory?.name ?? f.vendor} (${f.decideBy})`).join(", ")}`);
}

const count = (v: string) => judged.filter((j) => j.decision.verdict === v).length;
console.log(
  `\n${judged.length} judged: ${count("cancel")} cancel, ${count("review")} review, ${count("keep")} keep. Cancel candidates add up to ${money(cancelSavings(judged))} a year.`,
);

const summary: RunSummary = { judged, later, watchDays: WATCH_DAYS };

if (opts.dryRun || DEMO) {
  console.log("\nThe Slack brief this run would post:\n");
  console.log(briefText(summary).replace(/^/gm, "   "));
}

if (opts.dryRun) {
  console.log("\ndry run: nothing posted to Slack");
} else if (DEMO) {
  console.log("\ndemo mode: nothing was posted to Slack, nothing was cancelled anywhere");
} else if (slackConfigured()) {
  await postBrief(briefText(summary));
  console.log("posted to Slack");
} else {
  console.log("Slack brief not configured (optional)");
}
