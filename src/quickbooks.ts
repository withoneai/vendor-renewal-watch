import * as quickbooks from "@withone/sdk/quickbooks";
import { DEMO, connections, loadFixture, oneClient, quickbooksRealmId } from "./config.js";
import type { Charge, QuickBooksTxn } from "./types.js";

const qbConn = () => oneClient().connection(connections.quickbooks());
const PAGE = 1000;

/**
 * Reads every Purchase (card, check, cash) and every Bill since `since`,
 * through the typed `@withone/sdk/quickbooks` query actions. Both, because a
 * subscription paid on the company card lands as a Purchase while an invoiced
 * contract (Salesforce, AWS) lands as a Bill, and a renewal watch that reads
 * only one of them misses half the vendors.
 */
export async function readCharges(since: Date): Promise<Charge[]> {
  if (DEMO) {
    const purchases = loadFixture("quickbooks/purchases.json") as QuickBooksTxn[];
    const bills = loadFixture("quickbooks/bills.json") as QuickBooksTxn[];
    const from = since.toISOString().slice(0, 10);
    return [
      ...purchases.map((t) => toCharge(t, "Purchase")),
      ...bills.map((t) => toCharge(t, "Bill")),
    ].filter((c) => c.vendor && c.date >= from);
  }

  const [purchases, bills] = await Promise.all([queryAll("Purchase", since), queryAll("Bill", since)]);
  return [
    ...purchases.map((t) => toCharge(t, "Purchase")),
    ...bills.map((t) => toCharge(t, "Bill")),
  ].filter((c) => c.vendor);
}

async function queryAll(entity: "Purchase" | "Bill", since: Date): Promise<QuickBooksTxn[]> {
  const all: QuickBooksTxn[] = [];
  for (let start = 1; ; start += PAGE) {
    const input = {
      path: { realmId: quickbooksRealmId() },
      query: {
        query: `select * from ${entity} where TxnDate >= '${since.toISOString().slice(0, 10)}' startposition ${start} maxresults ${PAGE}`,
      },
    };
    const res = await qbConn().run(
      entity === "Purchase" ? quickbooks.queryPurchasesSqlQuery(input) : quickbooks.queryBillsSql(input),
    );
    const data = res.data as { QueryResponse?: Record<string, QuickBooksTxn[] | undefined> };
    const page = data.QueryResponse?.[entity] ?? [];
    all.push(...page);
    if (page.length < PAGE) return all;
  }
}

function toCharge(t: QuickBooksTxn, kind: Charge["kind"]): Charge {
  return {
    id: `${kind}-${t.Id}`,
    kind,
    vendor: (kind === "Bill" ? t.VendorRef?.name : t.EntityRef?.name)?.trim() ?? "",
    date: t.TxnDate,
    amount: t.TotalAmt,
    account: t.Line?.find((l) => l.AccountBasedExpenseLineDetail)?.AccountBasedExpenseLineDetail?.AccountRef?.name ?? null,
  };
}

/** A cheap liveness probe for `npm run check`: the company record. */
export async function probeQuickBooks(): Promise<string> {
  const res = await qbConn().run(
    quickbooks.queryCompanyInfoSqlQuery({
      path: { realmId: quickbooksRealmId() },
      query: { query: "select * from CompanyInfo" },
    }),
  );
  const data = res.data as { QueryResponse?: { CompanyInfo?: Array<{ CompanyName?: string }> } };
  const name = data.QueryResponse?.CompanyInfo?.[0]?.CompanyName;
  if (!name) throw new Error("QuickBooks answered, but not with a company record.");
  return name;
}
