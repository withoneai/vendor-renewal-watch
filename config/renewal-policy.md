# Renewal policy

This is the whole configuration for the renewal judgment. The model reads it
verbatim for every vendor whose decision date falls inside the watch window.
Edit it in plain English; no code reads it.

The facts are already established before the model sees a vendor: the
cadence, the price, what a year costs, the price change on a year ago, the
renewal date, the notice deadline, and the inventory row (owner, seats,
status, notes). The model's job is the call, not the arithmetic.

## Cancel (recommend we stop paying)

- Fewer than a quarter of the purchased seats are in use, and the notes do
  not give a concrete reason the tool is still needed.
- The inventory notes say the team moved to something else, and the only
  remaining use is occasional. Two webinars a quarter is occasional.
- The owner has left the company and nobody has taken the tool over. A tool
  with no living owner is a tool nobody will notice losing.

## Review (keep paying for now, but someone has to decide)

- The price went up more than 20% on a year ago. Usage-billed vendors
  count: a bill that grew 60% is a decision even if nobody signed anything.
- Less than half of the purchased seats are in use. Usually the answer is to
  drop seats at renewal, not to cancel.
- There is no inventory row at all. Somebody is paying for this, and the
  first question is who owns it.
- The notice deadline is inside the next 30 days and anything above is in
  play. Missing a notice period locks in a full year.

## Keep

- Seats are mostly in use, the price is flat or moved less than 20%, and
  the owner is still here.
- Production infrastructure the business runs on. Flag a price jump for
  review, but never recommend cancelling infrastructure.

## How to write the note

- One or two sentences, naming the fact that drove the call: the seat count,
  the price change, the note in the inventory. Never invent usage numbers,
  discounts, or contract terms you were not given.
- The ask is the one question to put to the owner, written so they can
  answer it in a line ("Can we drop Figma to 10 seats before Oct 26?").
  Null when the verdict is keep and there is nothing to ask.
- No em dashes or en dashes.
