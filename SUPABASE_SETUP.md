# Supabase setup — LCL Ops

This moves your data off this one browser into a shared cloud database.
It's free. Follow these steps once, then send me the two values in step 4.

## 1. Create the project
1. Go to **https://supabase.com** → **Start your project** → sign in (GitHub or email).
2. Click **New project**.
   - **Name:** `lcl-ops`
   - **Database password:** pick a strong one and **save it somewhere** (you won't need it day-to-day, but keep it).
   - **Region:** choose **London (eu-west-2)** (closest to you).
3. Click **Create new project** and wait ~2 minutes for it to finish setting up.

## 2. Create the tables
1. In the left sidebar click **SQL Editor** → **New query**.
2. Open the file **`supabase/schema.sql`** in this project, copy everything, paste it in.
3. Click **Run**. You should see "Success. No rows returned."

## 3. Confirm the storage bucket
- Left sidebar → **Storage**. You should see a bucket called **`job-files`**. (The SQL created it.)

## 4. Get your keys and send them to me
1. Left sidebar → **Project Settings** (gear) → **API**.
2. Copy these two values:
   - **Project URL** (looks like `https://abcdwxyz.supabase.co`)
   - **anon public** key (a long string under "Project API keys")
3. Send me both — or paste them yourself into a new file `.env.local` like this:

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://abcdwxyz.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_public_key
   ```

   (Keep your existing GMAIL_USER / GMAIL_APP_PASSWORD lines too.)

## 5. I take over
Once the keys are in, I'll switch the app's data layer to Supabase, push your
current data up, and verify it's reading/writing from the cloud. The login stays
the same for now (real per-user accounts come in a later step).

---

### Notes
- The anon key is **safe to expose** to the browser — that's what it's for.
- Phase 1 leaves the database open to anyone with the anon key (fine for an
  internal tool behind the app login). Phase 2 adds real accounts + security rules.
- Until the keys are added, the app keeps working exactly as now (localStorage).
