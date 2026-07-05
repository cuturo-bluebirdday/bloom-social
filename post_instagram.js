// post_instagram.js — publish the 3 daily screenshots to Instagram.
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
  seqld: "🔱 South East QLD — live algae & water clarity, seen from space.\n\nRead the water before you dive. Free · no ads · bloombyday.com\n\n#freediving #spearfishing #goldcoast #sunshinecoast #brisbane #ocean #scuba #diving #algae",
  nsw:   "🔱 NSW coast — live algae & water clarity, seen from space.\n\nRead the water before you dive. Free · no ads · bloombyday.com\n\n#freediving #spearfishing #nsw #sydney #ocean #scuba #diving #algae",
  wa:    "🔱 Western Australia — Ningaloo & the coral coast, live from space.\n\nRead the water before you dive. Free · no ads · bloombyday.com\n\n#freediving #spearfishing #ningaloo #westernaustralia #ocean #scuba #diving #algae",
};

if (!IG_USER_ID || !TOKEN) { console.error("Missing IG_USER_ID or IG_ACCESS_TOKEN"); process.exit(1); }

async function ig(path, params) {
  const body = new URLSearchParams({ ...params, access_token: TOKEN });
  const r = await fetch(`${GRAPH}/${path}`, { method: "POST", body });
  const j = await r.json();
  if (j.error) throw new Error(JSON.stringify(j.error));
  return j;
}
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

(async () => {
  const manifest = JSON.parse(fs.readFileSync(`social/manifest-${DATE}.json`, "utf8"));
  for (const shot of manifest.shots) {
    const imageUrl = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/social/${shot.file}`;
    console.log("posting", shot.name, imageUrl);
    try {
      // 1) create media container
      const c = await ig(`${IG_USER_ID}/media`, {
        image_url: imageUrl,
        caption: CAPTIONS[shot.name] || "bloombyday.com",
      });
      // 2) give IG a moment to fetch the image, then publish
      await sleep(6000);
      const p = await ig(`${IG_USER_ID}/media_publish`, { creation_id: c.id });
      console.log("✓ published", shot.name, "->", p.id);
    } catch (e) {
      console.error("✗ failed", shot.name, e.message);
      process.exitCode = 1;   // surface the failure, but keep trying the others
    }
    await sleep(4000);        // spacing between posts
  }
})();
