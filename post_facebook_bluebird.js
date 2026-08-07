// Bluebird weekly Facebook Page post — ONE combined post: a forward-looking
// WEEKEND DIVE FORECAST written from the ranked-spot data behind the three
// regional screenshots (best spots per region + best-in-Australia + avoid),
// plus the three screenshots attached as a photo gallery.
//
// GitHub secrets (Settings -> Secrets and variables -> Actions):
//   BLUEBIRD_FB_PAGE_ID       -> your Facebook Page's numeric ID
//   BLUEBIRD_FB_PAGE_TOKEN    -> a Page access token with pages_manage_posts
//   ANTHROPIC_API_KEY         -> your Claude API key (OPTIONAL; nicer wording)
// Optional repo variable:
//   BLUEBIRD_AI_MODEL         -> Claude model id (defaults below)
//
// If the AI key is absent or the AI call fails, a deterministic caption built
// from the SAME spot data is used, so the post always goes out in the right
// format. No token is ever printed or committed.

const fs = require('fs');
const PAGE     = process.env.FB_PAGE_ID;
const TOKEN    = process.env.FB_PAGE_ACCESS_TOKEN;
const AI_KEY   = process.env.ANTHROPIC_API_KEY || '';
const AI_MODEL = process.env.AI_MODEL || 'claude-haiku-4-5';
const REPO     = process.env.GITHUB_REPOSITORY || 'cuturo-bluebirdday/bloom-social';
const BRANCH   = process.env.GITHUB_REF_NAME   || 'main';
const BUST     = process.env.GITHUB_RUN_ID     || '';   // cache-buster so FB never fetches a stale card
const V = 'v21.0';
const G = `https://graph.facebook.com/${V}`;

const ORDER = ['qld', 'nsw', 'wa'];
const REGION_NAME = {
  qld: 'SE QLD',
  nsw: 'NSW',
  wa:  'WA (Perth & Coral Coast)',
};
const REGION_EMOJI = { qld: '🏆', nsw: '🌊', wa: '🌏' };
const HASHTAGS = '#spearfishing #freediving #scuba #diving #ocean #australia #bluebirdday';

// ---- parse the ranked-spot text the shoot captured into structured spots ----
// Text lines look like (hero):   Name \n RATING · N/7 \n 🌊 Xm · 💨 Ykm/h · 💧 vis · 🌡️ T°
//                    (runner):   \n N \n Name \n 🌊 Xm · 💨 Ykm/h · 💧 vis · 🌡️ T° \n RATING
function parseSpots(text) {
  const spots = [];
  if (!text) return spots;
  const hero = text.match(/\n([^\n]+)\n([A-Z ]+) · (\d)\/7\n🌊 ([\d.]+)m · 💨 (\d+)km\/h · 💧 ([^\n·]+) · 🌡️ (\d+)°/);
  if (hero) spots.push({ name: hero[1].trim(), rating: hero[2].trim(), score: +hero[3], swell: hero[4], wind: hero[5], vis: hero[6].trim(), temp: hero[7] });
  const re = /\n(\d)\n([^\n]+)\n🌊 ([\d.]+)m · 💨 (\d+)km\/h · 💧 ([^\n·]+) · 🌡️ (\d+)°\n([A-Z ]+)/g;
  let m;
  while ((m = re.exec(text))) {
    if (spots.some(s => s.name === m[2].trim())) continue;
    spots.push({ name: m[2].trim(), rating: m[7].trim(), score: +m[1], swell: m[3], wind: m[4], vis: m[5].trim(), temp: m[6] });
  }
  return spots;
}
const cond = s => `${s.swell}m / ${s.wind}km/h / ${s.vis}`;
const line = s => `${s.name} — ${s.rating} ${s.score}/7 (${cond(s)})`;

// ---- deterministic caption (fallback — always the right format) ----
function deterministicCaption(regions) {
  const P = [];
  P.push('🌊 Bluebird Day — Weekend Dive Forecast 🌊', '');
  P.push("Hey crew 👋 Here's where to get wet this weekend:");
  let best = null;
  regions.forEach(r => r.spots.forEach(s => { if (!best || s.score > best.score) best = { ...s, region: r.key }; }));
  regions.forEach(r => {
    const maxS = r.spots.length ? Math.max(...r.spots.map(s => s.score)) : 0;
    if (maxS < 3) return; // blown-out regions go to AVOID only, not "best"
    const top = r.spots.slice(0, 3);
    P.push('', `${REGION_EMOJI[r.key] || '📍'} ${REGION_NAME[r.key] || r.key}:`);
    top.forEach(s => P.push(line(s)));
  });
  if (best) P.push('', `🌟 BEST IN AUSTRALIA: ${best.name} — ${best.rating} ${best.score}/7 (${cond(best)})`);
  regions.filter(r => r.spots.length && Math.max(...r.spots.map(s => s.score)) <= 2).forEach(r => {
    const w = r.spots[0];
    P.push('', `⚠️ AVOID — ${REGION_NAME[r.key] || r.key}: blown out (${w.swell}m / ${w.wind}km/h, ${w.vis}). Sit it out.`);
  });
  P.push('', 'Check your exact spot & day 👇', '🔗 bluebirdday.app — free, no sign up 🌊', '', HASHTAGS);
  return P.join('\n');
}

// ---- AI caption (nicer voice, same structure) ----
async function aiCaption(regions) {
  if (!AI_KEY) return null;
  const brief = regions.map(r => {
    const top = r.spots.slice(0, 4).map(s => `- ${line(s)}`).join('\n');
    return `${REGION_NAME[r.key] || r.key}:\n${top || '- (no data this run)'}`;
  }).join('\n\n');
  const prompt =
`You are the social manager for "Bluebird Day", a FREE dive-conditions web app (bluebirdday.app) that scores dive spots 1-7 from swell, wind, water clarity, tide and moon. Below is the app's ranked "Best Diving Spot" data for the COMING WEEKEND across three Australian regions. Write ONE forward-looking Facebook post for the app's Page.

Requirements:
- Warm, energetic dive/spearfishing community voice — like a mate tipping you off, not corporate.
- Structure with emoji section headers: a short intro, then the best spots for EACH region that is diveable (SE QLD, NSW, WA), then a "BEST IN AUSTRALIA" highlight (the single strongest region/spot), then an "AVOID" call for any region that is blown out (all low scores / big swell / strong wind).
- Do NOT list a blown-out region's spots as "best" — put that region only under AVOID.
- For each diveable region, name the top 2-3 spots with their score (e.g. "6/7") and conditions in brackets (swell / wind / clarity). Use ONLY the spots and numbers given below — never invent spots or numbers.
- 130-200 words. A few emojis. One short safety nod (check conditions on site).
- End with the link bluebirdday.app (free, no sign up), then these hashtags exactly: ${HASHTAGS}
- Output ONLY the post text, nothing else.

DATA (coming weekend):
${brief}`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': AI_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: AI_MODEL, max_tokens: 800, messages: [{ role: 'user', content: prompt }] }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(JSON.stringify(j.error || j));
    const txt = (j.content || []).map(c => c.text || '').join('').trim();
    return txt || null;
  } catch (e) {
    console.error('AI caption failed, using deterministic:', e.message);
    return null;
  }
}

async function fbPost(path, params) {
  const body = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => body.set(k, v));
  const r = await fetch(G + path, { method: 'POST', body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(path + ' -> ' + JSON.stringify(j.error || j));
  return j;
}

(async () => {
  if (!PAGE || !TOKEN) throw new Error('Missing FB_PAGE_ID / FB_PAGE_ACCESS_TOKEN secrets');

  // Only post regions the shoot actually produced a card for.
  let valid = ORDER;
  try { valid = JSON.parse(fs.readFileSync('social/regions.json', 'utf8')); } catch (e) {}
  const toPost = ORDER.filter(r => valid.includes(r));
  if (!toPost.length) throw new Error('No region cards to post (social/regions.json empty)');

  // Ranked-spot text the shoot captured -> structured spots for the caption.
  let raw = [];
  try { raw = (JSON.parse(fs.readFileSync('social/bluebird-data.json', 'utf8')).regions) || []; } catch (e) {}
  const regions = toPost
    .map(k => { const d = raw.find(x => x.key === k) || { key: k, text: '' }; return { key: k, label: d.label, spots: parseSpots(d.text || '') }; })
    .filter(r => r.spots.length);

  const caption = (await aiCaption(regions)) || deterministicCaption(regions);
  console.log('caption:\n' + caption + '\n---');

  // 1) upload each screenshot as an UNPUBLISHED photo -> collect media ids
  const media = [];
  for (const r of toPost) {
    const url = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/social/bluebird-${r}.png` + (BUST ? `?v=${BUST}` : '');
    const ph = await fbPost(`/${PAGE}/photos`, { url, published: 'false', access_token: TOKEN });
    media.push(ph.id);
    console.log('uploaded', r, ph.id);
  }

  // 2) one feed post: the caption + all screenshots attached as a gallery
  const params = { message: caption, access_token: TOKEN };
  media.forEach((id, i) => { params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id }); });
  const post = await fbPost(`/${PAGE}/feed`, params);
  console.log('PUBLISHED ✓ facebook post', post.id);
})().catch(e => { console.error('FB post failed:', e.message || e); process.exit(1); });
