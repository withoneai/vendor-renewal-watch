import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { CLAUDE_MODEL, DEMO, loadFixture, loadPolicy } from "./config.js";
import { money } from "./recurring.js";
import type { Decision, VendorFacts } from "./types.js";

const client = new Anthropic();

const DecisionSchema = z.object({
  verdict: z.enum(["keep", "review", "cancel"]),
  reason: z.string(),
  ask: z.string().nullable(),
});

function describe(f: VendorFacts): string {
  const inv = f.inventory;
  const lines = [
    `Vendor (as billed in QuickBooks): ${f.vendor}`,
    `Cadence: ${f.cadence}, ${f.chargeCount} charges in the window`,
    `Expense account: ${f.account ?? "(none)"}`,
    `Latest charge: ${money(f.lastAmount)} on ${f.lastChargeDate}`,
    `Annual cost at the latest price: ${money(f.annualCost)}`,
    `Price change on a year ago: ${f.priceChangePct === null ? "no comparable charge" : `${f.priceChangePct > 0 ? "+" : ""}${f.priceChangePct}%`}`,
    `Next renewal: ${f.nextRenewal} (${f.daysUntilRenewal} days)`,
    `Notice deadline: ${f.noticeDeadline ? `${f.noticeDeadline}${f.noticeDeadline === f.decideBy ? ` (${f.daysUntilDecision} days)` : " (already passed)"}` : "none recorded"}`,
  ];
  if (!inv) {
    lines.push("Inventory row: none. This vendor is not in the tool inventory.");
  } else {
    lines.push(
      `Inventory row: ${inv.name}`,
      `  Owner: ${inv.owner ?? "(blank)"}`,
      `  Status: ${inv.status ?? "(blank)"}`,
      `  Seats: ${inv.seatsPurchased ?? "?"} purchased, ${inv.seatsActive ?? "?"} active`,
      `  Notes: ${inv.notes ?? "(none)"}`,
    );
  }
  return lines.join("\n");
}

/**
 * Applies the plain-English renewal policy to one vendor's facts. Never
 * called for a vendor still billing after the inventory marked it cancelled:
 * that gate runs in code, one level up in index.ts, because no wording in a
 * policy should be able to talk the model into "keep" for a subscription the
 * owner already killed. Everything this function sees is a fact the code
 * established; its job is the call.
 */
export async function judgeVendor(facts: VendorFacts): Promise<Decision> {
  if (DEMO) {
    const recorded = loadFixture("decisions.json") as Record<string, Decision>;
    const decision = recorded[facts.vendor];
    if (!decision) {
      throw new Error(`No recorded decision for ${facts.vendor} in fixtures/decisions.json.`);
    }
    return decision;
  }

  const prompt = `You are reviewing one recurring vendor ahead of its renewal, against our renewal policy. Follow the policy exactly. Do not re-derive any fact below; they are already established in code. Your job is the call: keep paying, review, or cancel, and why.

## Our renewal policy

${loadPolicy()}

## The vendor

${describe(facts)}

## Instructions

- verdict: "keep", "review", or "cancel", per the policy.
- reason: one or two sentences naming the concrete fact that drove the call.
- ask: the one question to put to the owner (or to finance, when there is no owner), answerable in a line, with the decide-by date (${facts.decideBy}) in it. Null when the verdict is keep and nothing needs asking.
- Never invent usage numbers, discounts, or contract terms that were not given to you.
- Style: no em dashes or en dashes anywhere. Use a comma, period, colon, or parentheses instead.`;

  const response = await client.messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
    output_config: { format: zodOutputFormat(DecisionSchema) },
  });

  if (response.stop_reason === "refusal") {
    throw new Error(`Claude declined to judge ${facts.vendor}.`);
  }
  if (!response.parsed_output) {
    throw new Error("Claude returned output that did not match the schema.");
  }
  return response.parsed_output;
}
