# AI Calling Agent (Vapi) setup — LCL Ops

This powers the **"AI Call"** button on a prospect's caller card (Prospects →
open a prospect → caller card). It places an outbound call where an AI voice
agent reads out the renewal pitch using that prospect's data, then logs the
outcome back into the contact history automatically.

> Until this is set up, the button shows "AI calling isn't set up yet". Nothing
> else breaks while you do this.

## 1. Create a Vapi account
1. Go to **https://vapi.ai** → sign up.
2. Dashboard → **API Keys** → copy your **Private Key**. This is `VAPI_API_KEY`.

## 2. Get a phone number
1. Dashboard → **Phone Numbers** → **Buy/Import a number** (Vapi uses Twilio
   under the hood — a UK number is recommended for UK landlords).
2. Copy the number's **ID** (not the phone number itself). This is
   `VAPI_PHONE_NUMBER_ID`.

## 3. Create the Assistant
1. Dashboard → **Assistants** → **Create Assistant**.
2. Pick a voice + model (e.g. GPT-4o + an ElevenLabs voice).
3. **System prompt** — write the renewal-pitch script using these variables
   (they're filled in per-call from the caller card):
   - `{{name}}` — name on the certificate
   - `{{service}}` — e.g. "Gas Safety Certificate"
   - `{{lastDone}}` — date of the last job
   - `{{dueDate}}` — renewal due date
   - `{{lastInvoice}}` — what they paid last time
   - `{{suggested}}` — suggested renewal price
   - `{{address}}` — property address
   - `{{company}}` — "Landlord Compliance London"

   Example opening line:
   > "Hi, is that {{name}}? I'm calling from {{company}} — our records show
   > your {{service}} at {{address}} is due for renewal on {{dueDate}}. We can
   > take care of that for you for {{suggested}} — would you like to book it in?"

4. Under **Advanced → Server URL**, set:
   ```
   https://lcl-ops.vercel.app/api/vapi/webhook
   ```
   and add a custom header `x-vapi-secret` with a secret value you choose
   (any random string).
5. Copy the assistant's **ID** from the URL or the assistant settings page.
   This is `VAPI_ASSISTANT_ID`.

## 4. Add the env vars
In `.env.local` (and Vercel → Settings → Environment Variables → Production):
```
VAPI_API_KEY=<your private key>
VAPI_ASSISTANT_ID=<assistant id>
VAPI_PHONE_NUMBER_ID=<phone number id>
VAPI_WEBHOOK_SECRET=<the same secret you set as x-vapi-secret>
```
Restart the dev server / redeploy after adding these.

## 5. Test it
1. Open Prospects → a prospect with a phone number → caller card.
2. Click **AI Call**. You (or the prospect) should receive a call within a
   few seconds.
3. After the call ends, Vapi sends a report to the webhook, which appends an
   "ai-call" entry to that prospect's contact history with a summary of the
   call — check the History panel on the caller card.

## Notes
- Calls cost roughly £0.05–0.15/min depending on voice + model — check Vapi's
  current pricing.
- The assistant talks to ONE prospect per click. Bulk/batch calling (working
  through a renewal-month call list automatically) is a possible future step
  once this is working well.
