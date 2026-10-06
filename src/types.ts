/** A QuickBooks Purchase (card, check, cash) or Bill, trimmed to what this repo reads. */
export interface QuickBooksTxn {
  Id: string;
  TxnDate: string;
  TotalAmt: number;
  PrivateNote?: string;
  /** Purchases name the payee here. */
  EntityRef?: { name?: string; type?: string };
  /** Bills name the vendor here. */
  VendorRef?: { name?: string };
  Line?: Array<{
    Amount?: number;
    AccountBasedExpenseLineDetail?: { AccountRef?: { name?: string } };
  }>;
}

export interface Charge {
  id: string;
  kind: "Purchase" | "Bill";
  vendor: string;
  date: string;
  amount: number;
  account: string | null;
}

/** One row of the Notion tool inventory, flattened from page properties. */
export interface InventoryEntry {
  name: string;
  owner: string | null;
  status: string | null;
  seatsPurchased: number | null;
  seatsActive: number | null;
  noticeDays: number | null;
  notes: string | null;
  url: string;
}

export type Cadence = "monthly" | "annual";

/** Everything code can establish about a recurring vendor. None of it is judgment. */
export interface VendorFacts {
  vendor: string;
  cadence: Cadence;
  chargeCount: number;
  account: string | null;
  lastChargeDate: string;
  lastAmount: number;
  /** What a year of this vendor costs at the latest price. */
  annualCost: number;
  /** Latest charge against the comparable charge a year earlier, in percent. Null without one. */
  priceChangePct: number | null;
  nextRenewal: string;
  daysUntilRenewal: number;
  /** Renewal date minus the contract's notice period, when the inventory records one. */
  noticeDeadline: string | null;
  /** The date a decision actually has to be made by: the notice deadline, else the renewal. */
  decideBy: string;
  daysUntilDecision: number;
  inventory: InventoryEntry | null;
  /** The inventory says Cancelled, and QuickBooks shows a charge since. */
  billingAfterCancel: boolean;
}

export type Verdict = "keep" | "review" | "cancel";

export interface Decision {
  verdict: Verdict;
  reason: string;
  /** The one question to put to the owner, or null when there is nothing to ask. */
  ask: string | null;
}

export interface Judged {
  facts: VendorFacts;
  decision: Decision;
  /** True when code made the call and the model was never asked. */
  forced: boolean;
}
