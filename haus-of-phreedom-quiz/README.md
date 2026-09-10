# Connecting this quiz to GoHighLevel

There's no public GHL API for *building* a Survey — their Survey/Form
builder is UI-only (confirmed: the GHL API only exposes read endpoints for
surveys, `get-surveys` / `get-surveys-submissions`, no create). So this quiz
stays custom-built (keeps the design) and pipes its results into GHL over a
webhook, which is the standard way to connect an external form/quiz to GHL.

## 1. Create the Inbound Webhook trigger in GHL

1. In your GHL sub-account: **Automation → Workflows → Create Workflow →
   Start from Scratch**.
2. Add trigger **"Inbound Webhook"**. Save the workflow — GHL generates a
   unique URL for that trigger (Settings tab of the trigger, or the
   workflow's webhook panel).
3. Copy that URL.

## 2. Wire it into the quiz

Open `script.js`, find the `CONFIG` object at the top, and paste the URL:

```js
var CONFIG = {
  GHL_WEBHOOK_URL: "https://services.leadconnectorhq.com/hooks/xxxxxxxx/webhook-trigger/xxxxxxxx",
  DISCOVERY_CALL_URL: "https://your-ghl-calendar-link"
};
```

`DISCOVERY_CALL_URL` is the calendar link the Green/Yellow result screens
send applicants to — paste your real GHL (or Calendly) booking link there
too.

## 3. What gets sent

On the "Where should we send your results?" step (right after question 6),
the quiz POSTs this JSON to your webhook URL:

```json
{
  "name": "Jane Doe",
  "email": "jane@email.com",
  "tier": "green",
  "answers": { "1": "green", "2": "yellow", "3": "green", "4": "green", "5": "yellow", "6": "green" },
  "quiz": "journee-readiness-quiz",
  "submittedAt": "2026-09-10T18:04:00.000Z"
}
```

`tier` is the overall result (`green` / `yellow` / `red` — lowest tier
touched wins, same logic as the scoring spec). `answers` is the per-question
tier so you can see exactly where someone lost points.

## 4. Use those fields in the workflow

Back in the workflow, after the Inbound Webhook trigger:

1. Add an **If/Else** (or three branches) on `{{trigger.tier}}`:
   - `equals green`
   - `equals yellow`
   - `equals red`
2. In each branch, add **"Create/Update Contact"** using `{{trigger.name}}`
   and `{{trigger.email}}`, then **Add Tag**:
   - Green → `journee-green-light`
   - Yellow → `journee-yellow-light`
   - Red → `journee-red-light`
3. Green/Yellow branches: enroll into whatever notifies your team to expect
   the discovery call booking (e.g. an internal notification, or nothing —
   the applicant is already headed to your calendar link).
4. Red branch: enroll into your **Not-Ready-Yet Nurture Sequence**.
5. Optional: add a custom field (Settings → Custom Fields) called something
   like `Readiness Answers` and map `{{trigger.answers}}` into it if you
   want the raw per-question breakdown on the contact record, not just the
   tag.

## Where results show up

- **Contacts** tab — new/updated contact per submission, tagged by tier.
- Inside the workflow's own **Execution Log**, every webhook hit.
- Whatever downstream automation you attach to each tag (email sequence,
  internal Slack/SMS notification, etc).

## Alternative: rebuild this as a native GHL Survey instead

If you'd rather use GHL's own Survey builder (Sites → Surveys) instead of
this custom page, you lose the custom brand design but get native
Submissions/Reporting built in. The question and answer copy in this repo
maps 1:1 to a GHL Survey with 6 multiple-choice questions — happy to write
out the paste-in copy if you'd rather go that route.
