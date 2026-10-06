import * as slack from "@withone/sdk/slack";
import { connections, oneClient, slackChannel } from "./config.js";
import { money } from "./recurring.js";
import type { Judged, VendorFacts, Verdict } from "./types.js";

export interface RunSummary {
  judged: Judged[];
  later: VendorFacts[];
  watchDays: number;
}

const VERDICT_EMOJI: Record<Verdict, string> = { cancel: ":red_circle:", review: ":large_orange_circle:", keep: ":white_check_mark:" };

export function cancelSavings(judged: Judged[]): number {
  return judged.filter((j) => j.decision.verdict === "cancel").reduce((sum, j) => sum + j.facts.annualCost, 0);
}

export function briefText(summary: RunSummary): string {
  const { judged, later } = summary;
  const toDecide = judged.filter((j) => j.decision.verdict !== "keep");
  const lines = [
    `*Vendor renewals, next ${summary.watchDays} days*`,
    "",
    `${judged.length} recurring vendors come up for a decision. ${toDecide.length} need one. Cancelling the ${judged.filter((j) => j.decision.verdict === "cancel").length} cancel candidates saves ${money(cancelSavings(judged))} a year.`,
  ];
  for (const j of toDecide) {
    const f = j.facts;
    const owner = f.inventory?.owner ?? "no owner on file";
    const link = f.inventory ? ` <${f.inventory.url}|inventory>` : "";
    lines.push(
      "",
      `${VERDICT_EMOJI[j.decision.verdict]} *${f.inventory?.name ?? f.vendor}*, ${money(f.annualCost)}/yr, decide by ${f.decideBy} (${owner})${link}`,
      `    ${j.decision.reason}`,
    );
    if (j.decision.ask) lines.push(`    _Ask:_ ${j.decision.ask}`);
  }
  const keeps = judged.filter((j) => j.decision.verdict === "keep");
  if (keeps.length) {
    lines.push("", `Keeping: ${keeps.map((j) => j.facts.inventory?.name ?? j.facts.vendor).join(", ")}.`);
  }
  if (later.length) {
    lines.push(`Further out: ${later.map((f) => `${f.inventory?.name ?? f.vendor} (${f.decideBy})`).join(", ")}.`);
  }
  return lines.join("\n");
}

export async function postBrief(text: string): Promise<void> {
  const res = await oneClient()
    .connection(connections.slack())
    .run(slack.sendMessageChannelChatPostmessage({ body: { channel: slackChannel(), text } }));
  const data = res.data as { ok?: boolean; error?: string };
  if (data?.ok === false) {
    throw new Error(`Slack rejected the message: ${data.error}`);
  }
}
