<h3 align="center">Vendor Renewal Watch</h3>
<p align="center">An AI agent for recurring vendor spend: find every subscription in your QuickBooks books, work out when it renews and what a year of it costs, check it against your tool inventory in Notion, and have Claude call out the ones nobody uses before the renewal date, with the one question to ask each owner.<br />Built on <a href="https://withone.ai">One</a>. Nothing is cancelled, changed, or written anywhere; this only reads and reports.</p>

<p align="center">
  <a href="https://withone.ai"><strong>Website</strong></a>
  &nbsp;·&nbsp;
  <a href="https://withone.ai/docs"><strong>Docs</strong></a>
  &nbsp;·&nbsp;
  <a href="https://app.withone.ai"><strong>Dashboard</strong></a>
</p>

---

## What it does

Subscriptions renew whether anyone is using them or not. The tool the team left in May, the seats bought for a team that halved, the contract with a 60-day notice period that nobody put in a calendar: each one is small, and together they are a line in the P&L nobody owns. Run this and it:

1. **Reads two years of spend from QuickBooks**: every Purchase (card, check, cash) and every Bill, because a card subscription and an invoiced contract land in different places in the books.
2. **Finds the vendors that bill on a schedule, in code.** Three charges a month apart is monthly; two charges a year apart is annual; a flight, six chairs, or one conference ticket is not a subscription and never reaches the model. A monthly vendor that stopped billing in March has already been cancelled and is dropped too.
3. **Establishes the facts in code**: the latest price, what a year costs, the price change on a year ago, the next renewal date, and the notice deadline when the contract has one.
4. **Reads your tool inventory from Notion** and pairs each vendor with its row: owner, seats purchased against seats active, status, notice period, and the note somebody left when the team stopped using it.
5. **Never re-litigates a cancellation.** A vendor the inventory marks Cancelled that QuickBooks still shows billing is routed straight to the cancel list, in code, before the model is asked anything.
6. **Has Claude make the call** on every vendor whose decision date falls in the next 90 days, against a renewal policy written in plain English in `config/renewal-policy.md`: keep, review, or cancel, the reason, and the one question to put to the owner.
7. **Posts one brief to Slack**, sorted by decide-by date, with the annual cost of every cancel candidate added up.

Sample output (fictional company, shipped as the demo fixture):

```
$ npm start

179 charges from 15 vendors since 2024-10-05, 10 tools in the inventory
10 bill on a schedule; 9 need a decision in the next 90 days

── Miro  $5,760/yr, monthly, decide by 2026-10-08 (3d)
   cancel: The owner, Dana Whitfield, left the company in June and 1 of 12 seats is in use...
── Hotjar  $1,188/yr, monthly, decide by 2026-10-15 (10d)
   cancel (forced): The inventory marks this cancelled, but QuickBooks shows a $99 charge on 2026-09-15...
── Salesforce  $36,000/yr, annual, +7.1% on a year ago, decide by 2026-10-20 (15d)
   review: All 12 seats are in use ... but the 60-day notice deadline is Oct 20...
   ask: Dev: are 12 Salesforce seats still right for next year? Any change has to be in writing by Oct 20.
── Figma  $9,000/yr, annual, +25% on a year ago, decide by 2026-10-26 (21d)
   review: Only 8 of 20 seats are active and the annual price went up 25% last year...
   ask: Lena: can we drop Figma to 10 editor seats before the Oct 26 renewal?

Further out, not judged: Calendly (2027-02-22)

9 judged: 3 cancel, 4 review, 2 keep. Cancel candidates add up to $10,788 a year.
```

Every platform call (QuickBooks, Notion, Slack) goes through [One](https://withone.ai), using the typed `@withone/sdk` modules for each.

## Try it in 60 seconds, no keys

```bash
git clone https://github.com/withoneai/vendor-renewal-watch
cd vendor-renewal-watch
npm install
npm start
```

With no keys in the environment, the same pipeline runs against two years of recorded spend for a fictional 40-person company and a recorded ten-row tool inventory. Every branch fires at least once: a tool whose owner left, a tool the team replaced, a subscription still billing after it was cancelled, a vendor nobody put in the inventory, an annual contract with a notice deadline inside the window, an annual plan with half its seats idle, a usage-billed vendor whose bill grew 61%, infrastructure that stays, a renewal too far out to judge yet, and a vendor that stopped billing in March and is correctly ignored. The demo also prints the Slack brief it would have posted.

## Go live (about 5 minutes)

**1. Connect QuickBooks and Notion through One**

```bash
npm i -g @withone/cli
one init             # create an account or log in
one add quickbooks
one add notion
```

**2. Configure this repo**

```bash
cp .env.example .env
```

Fill in `ONE_SECRET`, `ANTHROPIC_API_KEY`, the two connection keys from `one --agent list`, `QUICKBOOKS_REALM_ID` (the company ID in your QuickBooks URL), and `NOTION_INVENTORY_DATA_SOURCE_ID`. Slack is optional: add `ONE_CONNECTION_SLACK` and `SLACK_CHANNEL` when you want the brief posted (`one add slack`).

**3. The tool inventory**

A Notion database with one row per tool. The properties this reads, all optional except `Name`:

| Property | Type | What it is for |
| --- | --- | --- |
| `Name` | title | The tool, as it starts in QuickBooks ("Slack" matches "Slack Technologies, LLC") |
| `Owner` | text or person | Who gets the ask |
| `Status` | select | `Cancelled` routes a vendor that is still billing straight to the cancel list |
| `Seats purchased`, `Seats active` | number | The idle-seat check |
| `Notice period (days)` | number | Moves the decide-by date earlier than the renewal |
| `Notes` | text | Anything a human knows that the books do not ("moved to Google Meet in May") |

Different property names? Change them in one place, `PROPERTIES` in `src/notion.ts`. The data source id is in the database settings, under Manage data sources, then Copy data source ID.

**4. Write your renewal policy**

`config/renewal-policy.md` is the whole judgment configuration, in plain English: what makes a cancel, what makes a review, what to always keep, how to write the ask. The code that finds subscriptions does not read it; the model applies it verbatim.

**5. Check, then run**

```bash
npm run check         # policy parses, both connections answer
npm start             # read, detect, judge, brief
```

## Usage

```bash
# find recurring vendors, judge the ones with a decision in the next 90 days
npm start

# print every decision and the brief, post nothing to Slack
npm start -- --dry-run

# replay the recorded demo books even with keys present
npm start -- --demo
```

`LOOKBACK_MONTHS` (default 24) sets how much spend is read; keep it above 12 so annual contracts show two charges. `WATCH_DAYS` (default 90) sets how far ahead a decision has to be before the model is asked about it.

## What a run costs

Two QuickBooks queries (paged at 1,000 rows), one Notion query (paged at 100), and one Claude call per recurring vendor inside the watch window: usually ten to forty calls for a company with a normal SaaS stack. Run it monthly, or weekly in renewal season. It keeps no state between runs.

## The thing that is easy to get wrong

**Whether a vendor is a subscription is arithmetic. Whether to keep paying for it is judgment.** Cadence, price change, renewal date, and notice deadline are computed from dates and amounts, and the model is never asked to work them out, because a model that misreads a renewal date sends someone to renegotiate a contract that already rolled over. What those facts mean against the note in the inventory ("moved to Google Meet in May", "owner left in June") is a call, and that is the model's job, reading your policy file verbatim. The one exception never reaches the model: a tool your own inventory marks Cancelled that is still billing is a fact, and it goes to the cancel list in code.

The notice deadline is the date that matters most and the one most often missed. A 60-day notice clause means the decision on a December renewal is due in October; the brief sorts by that date, not by the renewal.

## How it is wired

| File | What it does |
| --- | --- |
| `config/renewal-policy.md` | The renewal policy, in plain English. The model reads it verbatim |
| `src/quickbooks.ts` | Reads Purchases and Bills via `@withone/sdk/quickbooks`, paged |
| `src/notion.ts` | Reads the tool inventory via `@withone/sdk/notion`, flattens properties |
| `src/recurring.ts` | Detects cadence, prices, renewal and notice dates; pairs vendors with inventory rows |
| `src/judge.ts` | Claude applies the policy to the facts; never called for a cancelled vendor still billing |
| `src/slack.ts` | Builds the brief and posts it via `@withone/sdk/slack` |
| `src/index.ts` | The run: read, detect, gate, judge, brief |
| `src/check.ts` | `npm run check`: policy parses, connections answer |
| `fixtures/` | The recorded books, inventory and decisions the demo replays |

## What it does not do

- It does not cancel, downgrade, or email anyone. The output is a brief; a human acts on it.
- It does not see usage inside each tool. Seat counts come from your inventory, so keep `Seats active` honest, or the idle-seat check has nothing to go on.
- It does not read contracts. Notice periods come from the inventory row; a vendor with no row has no notice deadline, and the brief says so.

## License

MIT
