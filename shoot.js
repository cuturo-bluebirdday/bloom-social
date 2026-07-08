// shoot.js — v2.1 (2026-07-07) — daily map screenshots for Instagram.
// v2.1: SEQLD reframed (zoom 8, -27.3559,153.4227) — tighter on Moreton/Brisbane/
//       Gold Coast, less unnecessary NSW. Framed via iPhone 12 Pro DevTools view.
// v2: CLEAN_CSS rebuilt against bloom-index v4.24 selectors. Keeps ONLY the
// BLOOM wordmark (logo + LIVE tag). Hides: subtitle, search bar, summary
// pills, socials row, scale bar, IN TIME circle, all leaflet chrome.
const { chromium } = require("playwright");
const fs = require("fs");

const DATE = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Brisbane" });
const OUT = "social";

// coords calibrated on iPhone 12 Pro emulation (390px) — phone framing
const SHOTS = [
  { name: "seqld", url: "https://bloombyday.com/?lat=-27.3559&lon=153.4227&zoom=8" },
  { name: "nsw",   url: "https://bloombyday.com/?lat=-34.3525&lon=151.3179&zoom=7" },
  { name: "wa",    url: "https://bloombyday.com/?lat=-27.7143&lon=114.2706&zoom=6" },
];

// hide ALL UI chrome except the BLOOM wordmark — just logo + clean map
const CLEAN_CSS = `
  /* legacy hides (pre-v4) */
  .beta-bar, #betabar        { display:none !important; }
  #stamp, .stamp             { display:none !important; }
  .leaflet-popup-pane        { display:none !important; }
  .leaflet-marker-pane       { display:none !important; }
  .leaflet-control-container { display:none !important; }
  .ctlstack                  { display:none !important; }

  /* v4.2x additions */
  .topbar .sub               { display:none !important; }  /* subtitle + version line */
  .searchbar                 { display:none !important; }  /* search input (v4.23) */
  #summary, .summary         { display:none !important; }  /* BLOOMING/BUILDING/CLEAR pills */
  .socials                   { display:none !important; }  /* IG/FB/YT icon row */
  #scalebar                  { display:none !important; }  /* dynamic km scale bar */
  a[href="time.html"]        { display:none !important; }  /* IN TIME circle (inline-styled <a>, no id) */

  /* belt-and-braces: any pin/ruler artifacts */
  .leaflet-shadow-pane       { display:none !important; }
`;

(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  // phone logical viewport (390x488) @ 2.77x ≈ 1080x1350 — matches iPhone 12 Pro framing
  const page = await browser.newPage({
    viewport: { width: 390, height: 488 },
    deviceScaleFactor: 2.77
  });
  const done = [];
  for (const s of SHOTS) {
    console.log("shooting", s.name);
    await page.goto(s.url, { waitUntil: "domcontentloaded", timeout: 45000 });
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
  console.log("done");
})();
