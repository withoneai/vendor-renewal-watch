import type { Cadence, Charge, InventoryEntry, VendorFacts } from "./types.js";

const DAY = 86_400_000;

/** Lowercase, "&"->"and", drop punctuation and legal suffixes, collapse whitespace. */
export function normalizeVendor(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|co|gmbh|plc|sa|bv)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function money(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function daysBetween(a: string | Date, b: string | Date): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / DAY);
}

function addMonths(date: string, months: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Decides, from dates alone, whether a vendor bills on a schedule. Monthly is
 * at least three charges about a month apart; annual is at least two about a
 * year apart. Either way the latest charge has to be recent enough that the
 * next one is still coming: a monthly vendor that last billed in March has
 * stopped, and is not a renewal to watch. Anything else (a flight, six
 * chairs, one conference) is not recurring and never reaches the model.
 */
function detectCadence(dates: string[], now: Date): Cadence | null {
  if (dates.length < 2) return null;
  const gaps = dates.slice(1).map((d, i) => daysBetween(dates[i], d));
  const gap = median(gaps);
  const sinceLast = daysBetween(dates[dates.length - 1], now);
  if (dates.length >= 3 && gap >= 26 && gap <= 35 && sinceLast <= 45) return "monthly";
  if (gap >= 350 && gap <= 380 && sinceLast <= 380) return "annual";
  return null;
}

/**
 * Pairs a QuickBooks vendor name with an inventory row. The inventory name
 * has to match the vendor name word for word at the start: "Slack" matches
 * "Slack Technologies, LLC", "Zoom" matches "Zoom Video Communications, Inc.".
 * The longest match wins. Deliberately no fuzzier than that, because pairing
 * a charge with the wrong tool's owner and seat count would hand the model a
 * confident, wrong picture.
 */
export function matchInventory(vendor: string, inventory: InventoryEntry[]): InventoryEntry | null {
  const v = normalizeVendor(vendor);
  let best: InventoryEntry | null = null;
  let bestLen = 0;
  for (const entry of inventory) {
    const n = normalizeVendor(entry.name);
    if (!n) continue;
    if ((v === n || v.startsWith(`${n} `)) && n.length > bestLen) {
      best = entry;
      bestLen = n.length;
    }
  }
  return best;
}

/**
 * Groups the charges by vendor and builds the facts for every vendor that is
 * still billing on a schedule: cadence, latest price, annual cost, the price
 * change on a year ago, the next renewal, the notice deadline, and the
 * inventory row. Sorted by how soon a decision is due.
 */
export function buildVendorFacts(charges: Charge[], inventory: InventoryEntry[], now: Date): VendorFacts[] {
  const byVendor = new Map<string, Charge[]>();
  for (const c of charges) {
    const key = normalizeVendor(c.vendor);
    if (!key) continue;
    byVendor.set(key, [...(byVendor.get(key) ?? []), c]);
  }

  const today = now.toISOString().slice(0, 10);
  const facts: VendorFacts[] = [];

  for (const list of byVendor.values()) {
    list.sort((a, b) => a.date.localeCompare(b.date));
    const cadence = detectCadence(list.map((c) => c.date), now);
    if (!cadence) continue;

    const last = list[list.length - 1];
    const months = cadence === "monthly" ? 1 : 12;
    let nextRenewal = addMonths(last.date, months);
    while (nextRenewal < today) nextRenewal = addMonths(nextRenewal, months);

    // The comparable charge a year earlier: for annual, the previous one;
    // for monthly, the charge closest to twelve months back, within 20 days.
    let yearAgo: Charge | undefined;
    if (cadence === "annual") {
      yearAgo = list[list.length - 2];
    } else {
      const target = addMonths(last.date, -12);
      yearAgo = list
        .filter((c) => Math.abs(daysBetween(c.date, target)) <= 20)
        .sort((a, b) => Math.abs(daysBetween(a.date, target)) - Math.abs(daysBetween(b.date, target)))[0];
    }
    const priceChangePct = yearAgo && yearAgo.amount > 0
      ? Math.round(((last.amount - yearAgo.amount) / yearAgo.amount) * 1000) / 10
      : null;

    const entry = matchInventory(last.vendor, inventory);
    let noticeDeadline: string | null = null;
    if (entry?.noticeDays) {
      const d = new Date(`${nextRenewal}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - entry.noticeDays);
      noticeDeadline = d.toISOString().slice(0, 10);
    }
    // A notice deadline already behind us is not the decision date any more:
    // the next renewal is, and the fact that notice was missed travels along.
    const decideBy = noticeDeadline && noticeDeadline >= today ? noticeDeadline : nextRenewal;

    facts.push({
      vendor: last.vendor,
      cadence,
      chargeCount: list.length,
      account: last.account,
      lastChargeDate: last.date,
      lastAmount: last.amount,
      annualCost: cadence === "monthly" ? last.amount * 12 : last.amount,
      priceChangePct,
      nextRenewal,
      daysUntilRenewal: daysBetween(today, nextRenewal),
      noticeDeadline,
      decideBy,
      daysUntilDecision: daysBetween(today, decideBy),
      inventory: entry,
      billingAfterCancel: entry?.status?.toLowerCase() === "cancelled",
    });
  }

  return facts.sort((a, b) => a.daysUntilDecision - b.daysUntilDecision);
}
