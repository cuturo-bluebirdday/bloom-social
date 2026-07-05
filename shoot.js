// shoot.js — screenshot the 3 Bloom map regions for the daily IG post.
// Hides the disclaimer banner + control stack via injected CSS so the shot is
// clean (no app change needed). Saves PNGs + a manifest the poster reads.
const { chromium } = require("playwright");
const fs = require("fs");

// Brisbane date (AEST, no DST) -> YYYY-MM-DD, used in filenames so each day is unique
const DATE = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Brisbane" });
const OUT = "social";

const SHOTS = [
  { name: "seqld", url: "https://bloombyday.com/?lat=-27.8140&lon=153.0016&zoom=7" },
  { name: "nsw",   url: "https://bloombyday.com/?lat=-34.9876&lon=151.3691&zoom=7" },
  { name: "wa",    url: "https://bloombyday.com/?lat=-27.9846&lon=113.3965&zoom=6" },
];

// CSS injected before the screenshot to clean the frame to a pure map.
// (Eyeball the run — add any selector that still shows.)
const CLEAN_CSS = `
  .beta-bar, #betabar        { display:none !important; }   /* disclaimer banner */
  .ctlstack                  { display:none !important; }   /* left control stack */
  #stamp, .stamp             { display:none !important; }   /* footer credits line */
  .leaflet-control-container { display:none !important; }   /* zoom/attribution */
  .leaflet-popup-pane        { display:none !important; }   /* the 'back to Bluebird' popup */
  .leaflet-marker-pane,
  .leaflet-shadow-pane       { display:none !important; }   /* dive-spot dots + bridge pin */
  #scale, .scale-ref         { display:none !important; }   /* the km scale */
  #intime, .intime, .timebtn { display:none !important; }   /* IN TIME button */
`;

(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  // 1080x1350 = Instagram's ideal 4:5 portrait feed size
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });

  const done = [];
  for (const s of SHOTS) {
    console.log("shooting", s.name, s.url);
    await page.goto(s.url, { waitUntil: "load", timeout: 60000 });
    // let Leaflet tiles + the bloom overlay actually paint (dynamic app, no networkidle)
    await page.waitForTimeout(10000);
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
