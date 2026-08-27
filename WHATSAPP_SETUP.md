# WhatsApp Business (auto-send) setup — LCL Ops

This makes the **WhatsApp** button send automatically (instead of opening the
WhatsApp app). It uses Meta's free **WhatsApp Cloud API**.

> Until this is set up, the WhatsApp button still works as click-to-send. Nothing
> breaks while you do this.

## The honest overview
Three things, and **#3 is the one that takes time** (Meta reviews it):
1. A **Meta app + WhatsApp Business Account** (free).
2. A **phone number** for WhatsApp Business — it must **not** already be used on
   the normal WhatsApp app. (Meta gives you a free test number to start.)
3. **Approved message templates** — to start a chat with a customer (a quote,
   reminder, etc.) WhatsApp requires a pre-approved template. Replies within 24h
   can be free text. Template approval takes anywhere from minutes to ~1 day.

## Steps

### 1. Create the app
1. Go to **https://developers.facebook.com** → log in → **My Apps** → **Create App**.
2. Use case: **Other** → type **Business** → name it `LCL Ops` → create.
3. In the app dashboard, find **WhatsApp** → **Set up**.

### 2. Get your test credentials
1. Left menu → **WhatsApp → API Setup**.
2. You'll see a **test number** already provided, a **Phone number ID**, and a
   temporary **access token** (good for 24h — fine for a first test).
3. Add your own phone as a test recipient and send the sample message to confirm
   it works.

### 3. Send me (or paste into `.env.local`)
```
WHATSAPP_TOKEN=<the access token>
WHATSAPP_PHONE_NUMBER_ID=<the Phone number ID>
```
I'll switch on auto-send. With the **temporary token** we can test immediately;
for production we'll create a **permanent token** (see below).

### 4. Make it permanent (for production)
1. **Business Settings → Users → System Users** → add a system user (Admin).
2. **Generate token** → select your app → permissions **whatsapp_business_messaging**
   and **whatsapp_business_management** → this token **doesn't expire**.
3. (For your own number instead of the test one) add + verify your business phone
   number under **WhatsApp → Phone numbers**, and complete **Business verification**.

### 5. Templates (for quotes/reminders)
Under **WhatsApp → Message templates**, create templates for the messages you send
(quote, booking, invoice, reminder) and submit for approval. Once approved, tell me
and I'll wire the app's quote/booking/invoice/reminder buttons to send those
templates automatically.

---

**TL;DR for right now:** do steps 1–3 and send me the **token** + **phone number
ID**, and I'll turn on auto-send for testing. Templates (step 5) come after.
