// shoot.js — screenshot the 3 Bloom map regions for the daily IG post.
// Hides the disclaimer banner + control stack via injected CSS so the shot is
// clean (no app change needed). Saves PNGs + a manifest the poster reads.
const { chromium } = require("playwright");
const fs = require("fs");

// Brisbane date (AEST, no DST) -> YYYY-MM-DD, used in filenames so each day is unique
const DATE = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Brisbane" });
const OUT = "social";

const SHOTS = [
  { name: "seqld", url: "https://bloombyday.com/?lat=-27.8140&lon=153.0016&zoom=11" },
  { name: "nsw",   url: "https://bloombyday.com/?lat=-34.9876&lon=151.3691&zoom=11" },
  { name: "wa",    url: "https://bloombyday.com/?lat=-27.9846&lon=113.3965&zoom=10" },
];

// CSS injected before the screenshot. Removes only the disclaimer, the
// dive-spot dots, and the deep-link popup — and makes sure the side control
// stack is clearly visible (it sells the tool as interactive).
const CLEAN_CSS = `
  .beta-bar, #betabar        { display:none !important; }   /* disclaimer banner */
  #stamp, .stamp             { display:none !important; }   /* footer credits line */
  .leaflet-popup-pane        { display:none !important; }   /* 'back to Bluebird' popup box */
  .leaflet-marker-pane       { display:none !important; }   /* dive-spot dots + bridge coral pin */
  .leaflet-control-container { display:none !important; }   /* leaflet zoom/attribution only */

  /* portrait: IG crops the grid thumbnail to a square (chops top & bottom).
     anchor the side control stack TOP-left so it survives the crop. */
  .ctlstack {
    display:flex !important; visibility:visible !important; opacity:1 !important;
    left:16px !important; top:150px !important; bottom:auto !important; z-index:2000 !important;
  }
`;

(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  // 1080x1350 = portrait 4:5 (matches the existing IG grid)
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });

  const done = [];
  for (const s of SHOTS) {
    console.log("shooting", s.name, s.url);
    await page.goto(s.url, { waitUntil: "domcontentloaded", timeout: 45000 });
    // a live map streams tiles + animates currents, so 'load' may never fire.
    // wait a fixed spell for the bloom overlay + tiles to actually paint instead.
    await page.waitForTimeout(12000);
    await page.addStyleTag({ content: CLEAN_CSS });
    await page.waitForTimeout(500);
    const file = `${OUT}/${s.name}-${DATE}.png`;
    await page.screenshot({ path: file });
    console.log("saved", file);
    done.push({ name: s.name, file: `${s.name}-${DATE}.png` });
  }
  await browser.close();

  fs.writeFileSync(`${OUT}/manifest-${DATE}.json`,
    JSON.stringify({ date: DATE, shots: done }, null, 2));
  console.log("manifest written for", DATE);
})();
