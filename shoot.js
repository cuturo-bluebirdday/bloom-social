const { chromium } = require("playwright");
const fs = require("fs");

const DATE = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Brisbane" });
const OUT = "social";

const SHOTS = [
  { name: "seqld", url: "https://bloombyday.com/?lat=-27.8140&lon=153.0016&zoom=7" },
  { name: "nsw",   url: "https://bloombyday.com/?lat=-34.9876&lon=151.3691&zoom=7" },
  { name: "wa",    url: "https://bloombyday.com/?lat=-27.9846&lon=113.3965&zoom=6" },
];

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
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
  const done = [];
  for (const s of SHOTS) {
    console.log("shooting", s.name);
    await page.goto(s.url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(12000);
    await page.addStyleTag({ content: CLEAN_CSS });
    await page.waitForTimeout(500);
    const file = `${OUT}/${s.name}-${DATE}.png`;
    await page.screenshot({ path: file });
    done.push({ name: s.name, file: `${s.name}-${DATE}.png` });
  }
  await browser.close();
  fs.writeFileSync(`${OUT}/manifest-${DATE}.json`, JSON.stringify({ date: DATE, shots: done }, null, 2));
  console.log("done");
})();
