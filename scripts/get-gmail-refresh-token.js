#!/usr/bin/env node
// One-time helper: generates a fresh Gmail OAuth refresh token.
//
// Why you need this: Google expired/revoked the previous refresh token
// (GMAIL_REFRESH_TOKEN in .env.local / Vercel). This is what silently broke
// inbound-reply logging — the webhook and "Activate" button in Settings
// both depend on it.
//
// Usage:
//   1. Run:  node scripts/get-gmail-refresh-token.js
//   2. It prints a Google sign-in URL — open it, sign in as
//      landlordcompliancelondon@gmail.com, approve access.
//   3. Google redirects back to this script's local server, which prints
//      a brand-new refresh token.
//   4. Copy that token into .env.local (GMAIL_REFRESH_TOKEN=...) AND into
//      Vercel: `npx vercel env rm GMAIL_REFRESH_TOKEN production` then
//      `npx vercel env add GMAIL_REFRESH_TOKEN production` (paste the token).
//   5. Redeploy.
//
// If Google shows "redirect_uri_mismatch": go to
// https://console.cloud.google.com/apis/credentials, open the OAuth client
// matching GMAIL_CLIENT_ID, and add the exact URL this script prints
// under "Authorized redirect URIs", then re-run.
//
// No npm packages needed — plain Node http + fetch.

const http = require("http");
const { URL } = require("url");
const fs = require("fs");
const path = require("path");

function loadEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
  const out = {};
  if (!fs.existsSync(envPath)) return out;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const env = loadEnvLocal();
const CLIENT_ID = env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = env.GMAIL_CLIENT_SECRET;
const PORT = 53682;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Missing GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET in .env.local — can't continue.");
  process.exit(1);
}

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
].join(" ");

const authUrl =
  `https://accounts.google.com/o/oauth2/v2/auth?` +
  `client_id=${encodeURIComponent(CLIENT_ID)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(SCOPES)}` +
  `&access_type=offline` +
  `&prompt=consent`; // force prompt so Google issues a NEW refresh token every time

console.log("\n=== Gmail refresh token generator ===\n");
console.log("1. Open this URL in your browser and sign in as landlordcompliancelondon@gmail.com:\n");
console.log(authUrl + "\n");
console.log(`Waiting for Google to redirect back to ${REDIRECT_URI} ...\n`);
console.log("(If you see 'redirect_uri_mismatch': add the URL above's origin —");
console.log(`  ${REDIRECT_URI}`);
console.log("  — to the OAuth client's 'Authorized redirect URIs' in Google Cloud Console, then re-run this script.)\n");

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== "/oauth2callback") {
    res.writeHead(404); res.end(); return;
  }
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`<h2>Error: ${error}</h2><p>Close this tab and check the terminal.</p>`);
    console.error(`\nGoogle returned an error: ${error}`);
    server.close();
    process.exit(1);
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });
    const data = await tokenRes.json();

    if (!data.refresh_token) {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<h2>No refresh_token in response</h2><pre>${JSON.stringify(data, null, 2)}</pre><p>Close this tab and check the terminal.</p>`);
      console.error("\nNo refresh_token came back. Full response:");
      console.error(JSON.stringify(data, null, 2));
      console.error("\nMost likely cause: you've authorized this app before without revoking it,");
      console.error("and Google only issues a refresh_token on the FIRST consent. Fix: go to");
      console.error("https://myaccount.google.com/permissions , find this app, click 'Remove access',");
      console.error("then re-run this script.");
      server.close();
      process.exit(1);
    }

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`<h2>Success — refresh token generated.</h2><p>Close this tab and go back to the terminal to copy it.</p>`);

    console.log("\n=== SUCCESS ===\n");
    console.log("New GMAIL_REFRESH_TOKEN:\n");
    console.log(data.refresh_token);
    console.log("\nNext steps:");
    console.log("  1. Update .env.local: GMAIL_REFRESH_TOKEN=" + data.refresh_token);
    console.log("  2. Update Vercel production:");
    console.log("       npx vercel env rm GMAIL_REFRESH_TOKEN production");
    console.log("       npx vercel env add GMAIL_REFRESH_TOKEN production   (paste the token when prompted)");
    console.log("  3. Redeploy: npx vercel --prod --yes");
    console.log("  4. In the app, Settings → Gmail push → Activate\n");
  } catch (err) {
    console.error("\nToken exchange failed:", err.message);
  } finally {
    server.close();
    setTimeout(() => process.exit(0), 500);
  }
});

server.listen(PORT);
