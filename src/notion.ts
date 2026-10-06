import * as notion from "@withone/sdk/notion";
import { DEMO, connections, inventoryDataSourceId, loadFixture, oneClient } from "./config.js";
import type { InventoryEntry } from "./types.js";

const notionConn = () => oneClient().connection(connections.notion());

/**
 * The property names this repo reads from the inventory database. Rename them
 * here if your database uses different ones; any that are missing read as
 * empty, and the model is told the inventory had nothing to say.
 */
export const PROPERTIES = {
  name: "Name",
  owner: "Owner",
  status: "Status",
  seatsPurchased: "Seats purchased",
  seatsActive: "Seats active",
  noticeDays: "Notice period (days)",
  notes: "Notes",
} as const;

interface NotionPage {
  id: string;
  url: string;
  properties: Record<string, NotionProperty | undefined>;
}

interface NotionProperty {
  type: string;
  title?: Array<{ plain_text: string }>;
  rich_text?: Array<{ plain_text: string }>;
  number?: number | null;
  select?: { name: string } | null;
  status?: { name: string } | null;
  people?: Array<{ name?: string }>;
}

/**
 * One read: every row of the tool inventory, through the typed
 * `@withone/sdk/notion` data source query. This is where the human context
 * lives that the books cannot hold: who owns a tool, how many seats are in
 * use, the notice period in the contract, and the note somebody left when
 * the team stopped using it.
 */
export async function readInventory(): Promise<InventoryEntry[]> {
  if (DEMO) {
    return (loadFixture("notion/inventory.json") as NotionPage[]).map(toEntry).filter((e) => e.name);
  }

  const pages: NotionPage[] = [];
  let cursor: string | undefined;
  do {
    const res = await notionConn().run(
      notion.queryDataSourcesPages({
        path: { dataSourceId: inventoryDataSourceId() },
        body: { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) },
      }),
    );
    const data = res.data as { results?: NotionPage[]; has_more?: boolean; next_cursor?: string | null };
    if (!Array.isArray(data.results)) {
      throw new Error("Notion answered, but not with a list of inventory rows.");
    }
    pages.push(...data.results);
    cursor = data.has_more && data.next_cursor ? data.next_cursor : undefined;
  } while (cursor);
  return pages.map(toEntry).filter((e) => e.name);
}

function text(p: NotionProperty | undefined): string | null {
  if (!p) return null;
  const parts = p.title ?? p.rich_text;
  if (parts) return parts.map((t) => t.plain_text).join("").trim() || null;
  if (p.select) return p.select.name;
  if (p.status) return p.status.name;
  if (p.people) return p.people.map((x) => x.name).filter(Boolean).join(", ") || null;
  return null;
}

function number(p: NotionProperty | undefined): number | null {
  return typeof p?.number === "number" ? p.number : null;
}

function toEntry(page: NotionPage): InventoryEntry {
  const props = page.properties;
  return {
    name: text(props[PROPERTIES.name]) ?? "",
    owner: text(props[PROPERTIES.owner]),
    status: text(props[PROPERTIES.status]),
    seatsPurchased: number(props[PROPERTIES.seatsPurchased]),
    seatsActive: number(props[PROPERTIES.seatsActive]),
    noticeDays: number(props[PROPERTIES.noticeDays]),
    notes: text(props[PROPERTIES.notes]),
    url: page.url,
  };
}

/** A cheap liveness probe for `npm run check`: the first page of rows. */
export async function probeNotion(): Promise<number> {
  const res = await notionConn().run(
    notion.queryDataSourcesPages({ path: { dataSourceId: inventoryDataSourceId() }, body: { page_size: 5 } }),
  );
  const data = res.data as { results?: unknown[] };
  if (!Array.isArray(data.results)) {
    throw new Error("Notion answered, but not with a list of inventory rows.");
  }
  return data.results.length;
}
