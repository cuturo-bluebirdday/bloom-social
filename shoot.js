const { chromium } = require("playwright");
const fs = require("fs");

const DATE = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Brisbane" });
const OUT = "social";

// coords calibrated on iPhone 12 Pro emulation (390px) — phone framing
const SHOTS = [
  { name: "seqld", url: "https://bloombyday.com/?lat=-28.4071&lon=153.4007&zoom=7" },
  { name: "nsw",   url: "https://bloombyday.com/?lat=-34.3525&lon=151.3179&zoom=7" },
  { name: "wa",    url: "https://bloombyday.com/?lat=-27.7143&lon=114.2706&zoom=6" },
];

// hide all UI chrome — just the clean map
const CLEAN_CSS = `
  .beta-bar, #betabar        { display:none !important; }
  #stamp, .stamp             { display:none !important; }
  .leaflet-popup-pane        { display:none !important; }
  .leaflet-marker-pane       { display:none !important; }
  .leaflet-control-container { display:none !important; }
  .ctlstack                  { display:none !important; }
`;

(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  // phone logical viewport (390x550) @ 2.77x ≈ 1080x1350 — matches iPhone 12 Pro framing
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
