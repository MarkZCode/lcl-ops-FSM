// The identity of the deployment currently serving this app.
//
// A long-lived tab (and this runs as an installed PWA, so tabs live for days)
// keeps the build manifest it loaded with. After a redeploy that session still
// asks the CDN for its ORIGINAL chunk filenames — Vercel keeps serving them,
// so the app carries on running old code indefinitely, silently mixing old and
// new behaviour. If any of those older builds had a bug, the session keeps
// hitting it long after it was fixed: exactly the "getEngineerIdsSet is not
// defined" crash on Engineers, whose chunk was from a superseded deployment
// while the current one was clean.
//
// The client polls this and reloads when the value changes. See
// components/VersionWatcher.js.
export const dynamic = "force-dynamic";

export function GET() {
  const id =
    process.env.VERCEL_DEPLOYMENT_ID ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    "dev";
  return new Response(JSON.stringify({ id }), {
    headers: {
      "content-type": "application/json",
      // Must never be cached, or it would report the very staleness it exists
      // to detect.
      "cache-control": "no-store, max-age=0, must-revalidate",
    },
  });
}
