// post_instagram.js — v2.0 (2026-07-06) — publish the 3 daily screenshots to Instagram.
// v2 changes: preflight token/account/quota checks, image URL reachability check,
// container status polling (replaces blind 6s sleep), post-publish verification,
// loud per-step logging, hard exit 1 if fewer than all shots publish.
//
// Instagram's API fetches images from a PUBLIC URL, so this assumes the PNGs
// were committed to this PUBLIC repo (raw.githubusercontent.com) BEFORE running.
//
// Secrets needed (GitHub repo → Settings → Secrets → Actions):
//   IG_USER_ID       Instagram Business account ID (numeric)
//   IG_ACCESS_TOKEN  long-lived / system-user token w/ instagram_content_publish
const fs = require("fs");

const IG_USER_ID = process.env.IG_USER_ID;
const TOKEN      = process.env.IG_ACCESS_TOKEN;
const REPO       = process.env.GITHUB_REPOSITORY;         // "user/repo"
const BRANCH     = process.env.GITHUB_REF_NAME || "main";
const DATE       = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Brisbane" });
const GRAPH      = "https://graph.facebook.com/v21.0";

// captions — edit freely. \n = line break.
const CAPTIONS = {
  seqld: "South East Queensland\nEutrophication — when nutrients from land reach the sea and feed algae. This is what you're watching.\n#bloombyday #algae #eutrophication #freediving #spearfishing #goldcoast #sunshinecoast #moretonbay #oceandata\n\nBloombyday.com",
  nsw:   "NSW\nEutrophication — when nutrients from land reach the sea and feed algae. This is what you're watching.\n#bloombyday #algae #eutrophication #freediving #spearfishing #sydney #nsw #oceandata #divensw\n\nBloombyday.com",
  wa:    "WA\n#bloombyday #algae #freediving #spearfishing #westernaustralia #ningaloo #oceandata #divewa\n\nBloombyday.com",
};

if (!IG_USER_ID || !TOKEN) { console.error("FATAL: Missing IG_USER_ID or IG_ACCESS_TOKEN secret"); process.exit(1); }

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function igPost(path, params) {
  const body = new URLSearchParams({ ...params, access_token: TOKEN });
  const r = await fetch(`${GRAPH}/${path}`, { method: "POST", body });
  const j = await r.json();
  if (j.error) throw new Error(`POST /${path} → ${JSON.stringify(j.error)}`);
  return j;
}
async function igGet(path, params = {}) {
  const qs = new URLSearchParams({ ...params, access_token: TOKEN });
  const r = await fetch(`${GRAPH}/${path}?${qs}`);
  const j = await r.json();
  if (j.error) throw new Error(`GET /${path} → ${JSON.stringify(j.error)}`);
  return j;
}

// ---------- PREFLIGHT — fail fast with a readable reason ----------
async function preflight() {
  console.log("── PREFLIGHT ──");

  // 1) token sanity + scopes + expiry
  const dbg = await igGet("debug_token", { input_token: TOKEN });
  const d = dbg.data || {};
  console.log(`token: app_id=${d.app_id} type=${d.type} valid=${d.is_valid} expires=${d.expires_at === 0 ? "never" : new Date(d.expires_at * 1000).toISOString()}`);
  console.log(`scopes: ${(d.scopes || []).join(", ")}`);
  if (!d.is_valid) throw new Error("PREFLIGHT: token is INVALID — regenerate the system user token");
  if (!(d.scopes || []).includes("instagram_content_publish"))
    throw new Error("PREFLIGHT: token is missing instagram_content_publish scope");

  // 2) confirm the IG account the token actually sees
  const acct = await igGet(IG_USER_ID, { fields: "username,name" });
  console.log(`IG account: @${acct.username} (${IG_USER_ID})`);

  // 3) publishing quota (IG caps at 50 API posts / 24h)
  const quota = await igGet(`${IG_USER_ID}/content_publishing_limit`, { fields: "quota_usage,config" });
  const q = quota.data && quota.data[0];
  if (q) console.log(`publishing quota used: ${q.quota_usage} / ${q.config ? q.config.quota_total : "?"} (24h window)`);

  console.log("── PREFLIGHT OK ──");
}

// ---------- image URL must be publicly reachable ----------
async function checkImage(url) {
  const r = await fetch(url, { method: "GET" });
  const type = r.headers.get("content-type") || "";
  const len = r.headers.get("content-length") || "?";
  console.log(`image check: ${r.status} ${type} ${len} bytes — ${url}`);
  if (r.status !== 200) throw new Error(`image URL returned ${r.status} — not committed/pushed, wrong path, or repo not public`);
  if (!type.startsWith("image/")) throw new Error(`image URL content-type is "${type}", expected image/*`);
}

// ---------- poll container until IG has ingested the image ----------
async function waitForContainer(id, maxSeconds = 90) {
  for (let t = 0; t < maxSeconds; t += 5) {
    const s = await igGet(id, { fields: "status_code,status" });
    console.log(`container ${id}: ${s.status_code}${s.status ? " — " + s.status : ""}`);
    if (s.status_code === "FINISHED") return;
    if (s.status_code === "ERROR") throw new Error(`container ERROR: ${s.status || "no detail"}`);
    await sleep(5000);
  }
  throw new Error(`container ${id} not FINISHED after ${maxSeconds}s`);
}

(async () => {
  await preflight();

  const manifestPath = `social/manifest-${DATE}.json`;
  if (!fs.existsSync(manifestPath))
    throw new Error(`manifest not found: ${manifestPath} — shoot.js didn't run today, or the run crossed midnight Brisbane`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  console.log(`manifest: ${manifest.shots.length} shots for ${manifest.date}`);

  const published = [];
  for (const shot of manifest.shots) {
    const imageUrl = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/social/${shot.file}`;
    console.log(`\n── POSTING ${shot.name} ──`);
    try {
      await checkImage(imageUrl);

      // 1) create media container
      const c = await igPost(`${IG_USER_ID}/media`, {
        image_url: imageUrl,
        caption: CAPTIONS[shot.name] || "bloombyday.com",
      });
      console.log(`container created: ${c.id}`);

      // 2) wait until IG has actually fetched + processed the image
      await waitForContainer(c.id);

      // 3) publish
      const p = await igPost(`${IG_USER_ID}/media_publish`, { creation_id: c.id });
      console.log(`✓ published ${shot.name} → media id ${p.id}`);
      published.push({ name: shot.name, id: p.id });
    } catch (e) {
      console.error(`✗ FAILED ${shot.name}: ${e.message}`);
      process.exitCode = 1;   // surface the failure, but keep trying the others
    }
    await sleep(4000);        // spacing between posts
  }

  // ---------- VERIFY — do the published IDs actually exist on the account? ----------
  console.log("\n── VERIFY ──");
  const recent = await igGet(`${IG_USER_ID}/media`, { fields: "id,timestamp", limit: "10" });
  const liveIds = new Set((recent.data || []).map((m) => m.id));
  for (const p of published) {
    const ok = liveIds.has(p.id);
    console.log(`${ok ? "✓" : "✗"} ${p.name} (${p.id}) ${ok ? "confirmed live on @account" : "NOT FOUND in recent media!"}`);
    if (!ok) process.exitCode = 1;
  }

  console.log(`\nSUMMARY: ${published.length}/${manifest.shots.length} published, exit code ${process.exitCode || 0}`);
  if (published.length < manifest.shots.length) process.exitCode = 1;
})().catch((e) => {
  console.error(`FATAL: ${e.message}`);
  process.exit(1);
});
