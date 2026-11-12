const { execSync } = require("child_process");
const fs = require("fs");

function loadEnv() {
  if (fs.existsSync(".env.local")) {
    const lines = fs.readFileSync(".env.local", "utf8").split("\n");
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let val = match[2] || "";
        val = val.trim().replace(/^['"]|['"]$/g, "");
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}

loadEnv();

const token = process.env.VERCEL_TOKEN;
const teamId = process.env.VERCEL_ORG_ID || "team_E2SZK5gBvGfXm6wIIk14mKxQ";
const projectId = process.env.VERCEL_PROJECT_ID || "prj_2eIq0C6Aj7gyA3au5k7ADysf1wZA";

if (!token) {
  console.error("Error: VERCEL_TOKEN is missing in environment or .env.local");
  process.exit(1);
}

async function main() {
  console.log("=== STEP 1: Verifying compilation and build integrity ===");
  try {
    execSync("npm run build", { stdio: "inherit" });
    console.log("✓ Build verification passed with zero compilation errors.\n");
  } catch (err) {
    console.error("✗ Build failed! Fix compilation errors before deploying.");
    process.exit(1);
  }

  console.log("=== STEP 2: Pushing to GitHub (origin main) ===");
  try {
    execSync("git push origin main", { stdio: "inherit" });
    console.log("✓ Successfully pushed to GitHub main.\n");
  } catch (err) {
    console.error("✗ Failed to push to GitHub.");
    process.exit(1);
  }

  const sha = execSync("git rev-parse HEAD").toString().trim();
  console.log("=== STEP 3: Triggering Vercel deployment for Git commit ===");
  console.log("Git SHA:", sha);

  const res = await fetch(`https://api.vercel.com/v13/deployments?teamId=${teamId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "lcl-ops",
      project: projectId,
      target: "production",
      gitSource: {
        type: "github",
        repoId: 1428337874,
        ref: "main",
        sha: sha,
      },
    }),
  });

  const data = await res.json();
  if (!data.id) {
    console.error("✗ Failed to trigger deployment on Vercel:", data);
    process.exit(1);
  }

  const deploymentId = data.id;
  console.log(`✓ Deployment queued on Vercel: ${deploymentId}`);
  console.log(`Inspector: https://vercel.com/lcloperations/lcl-ops/${deploymentId}\n`);

  console.log("=== STEP 4: Monitoring deployment until live ===");
  const start = Date.now();
  while (Date.now() - start < 300000) {
    await new Promise((r) => setTimeout(r, 6000));
    try {
      const checkRes = await fetch(
        `https://api.vercel.com/v13/deployments/${deploymentId}?teamId=${teamId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const check = await checkRes.json();
      console.log(`[${new Date().toLocaleTimeString()}] Status: ${check.readyState}`);

      if (check.readyState === "READY") {
        console.log("\n==============================================");
        console.log("🎉 SUCCESS: Changes are LIVE in production!");
        console.log("URL: https://lcl-ops.vercel.app");
        console.log("==============================================");
        return;
      }
      if (check.readyState === "ERROR" || check.readyState === "CANCELED" || check.readyState === "BLOCKED") {
        console.error(`\n✗ Deployment failed: ${check.readyState}`);
        process.exit(1);
      }
    } catch (e) {
      console.log("Checking...", e.message);
    }
  }

  console.log("Deployment is still building in the background. Check Vercel dashboard.");
}

main();

