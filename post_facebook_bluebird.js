// Bluebird weekly Facebook Page post — ONE combined post: an AI-written weekend
// forecast caption + the 3 regional BEST SPOT screenshots as a photo gallery.
// Reuses the screenshots shoot-bluebird.js already commits to social/ (Facebook
// fetches each by its public raw.githubusercontent URL, exactly like Instagram).
//
// GitHub secrets to set (Settings → Secrets and variables → Actions):
//   BLUEBIRD_FB_PAGE_ID       -> your Facebook Page's numeric ID
//   BLUEBIRD_FB_PAGE_TOKEN    -> a Page access token with pages_manage_posts
//   ANTHROPIC_API_KEY         -> your Claude API key (for the AI caption)
// Optional repo variable:
//   BLUEBIRD_AI_MODEL         -> Claude model id (defaults below; override to your account's)
//
// If the AI call fails for any reason, a safe evergreen caption is used instead,
// so the weekly post still goes out. No token is ever printed or committed.

const fs = require('fs');
const PAGE    = process.env.FB_PAGE_ID;
const TOKEN   = process.env.FB_PAGE_ACCESS_TOKEN;
const AI_KEY  = process.env.ANTHROPIC_API_KEY || '';
const AI_MODEL= process.env.AI_MODEL || 'claude-3-5-haiku-latest';
const REPO    = process.env.GITHUB_REPOSITORY || 'cuturo-bluebirdday/bloom-social';
const BRANCH  = process.env.GITHUB_REF_NAME   || 'main';
const BUST    = process.env.GITHUB_RUN_ID     || '';   // cache-buster so FB never fetches a stale card
const V = 'v21.0';
const G = `https://graph.facebook.com/${V}`;

const ORDER = ['qld', 'nsw', 'wa'];
const REGION_NAME = {
  qld: 'Queensland — Southeast',
  nsw: 'New South Wales',
  wa:  'Western Australia — Perth & Coral Coast',
};

// Safety net if the AI call is unavailable — the post still goes out.
const FALLBACK =
`🌊 Bluebird Day — Weekend Dive Forecast 🌊

Here's how the coming Saturday is shaping up. One honest score, 1–7: swell, wind, water clarity, tide & moon combined into a single number. Free, no account.

Check your exact spot and day 👇
🔗 bluebirdday.app

Dive safe and watch your tides 🤿
#freediving #spearfishing #scuba #diving #ocean #australia #divelife`;

async function aiCaption(regions) {
  if (!AI_KEY) return null;
  const brief = regions
    .filter(r => r.text)
    .map(r => `### ${REGION_NAME[r.key] || r.key}\n${r.text}`)
    .join('\n\n');
  if (!brief) return null;
  const prompt =
`You are the social manager for "Bluebird Day", a FREE dive-conditions web app (bluebirdday.app) that scores dive spots 1–7 from swell, wind, water clarity, tide and moon. Below is the app's "Best Diving Spot" ranking for the COMING SATURDAY across Australian regions. Write ONE Facebook post for the app's Page.

Requirements:
- 110–180 words. Warm, energetic dive-community voice — not corporate.
- Lead with the strongest region/spot. Name 2–4 standout spots with their scores (e.g. "7/7").
- Mention the warmest water if notable, and call out any region that's blown out (all low scores / big swell / strong wind) as a "sit it out".
- One short safety nod (watch your tides / verify on site).
- End with the link bluebirdday.app (free, no ads) and 4–6 relevant hashtags.
- A few emojis are good. Do NOT invent spots or numbers — use only what's given below.
- Output ONLY the post text, nothing else.

DATA (coming Saturday):
${brief}`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': AI_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: 700,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(JSON.stringify(j.error || j));
    const txt = (j.content || []).map(c => c.text || '').join('').trim();
    return txt || null;
  } catch (e) {
    console.error('AI caption failed, using fallback:', e.message);
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

  // Only post regions the shoot step actually produced a card for.
  let valid = ORDER;
  try { valid = JSON.parse(fs.readFileSync('social/regions.json', 'utf8')); } catch (e) {}
  const toPost = ORDER.filter(r => valid.includes(r));
  if (!toPost.length) throw new Error('No region cards to post (social/regions.json empty)');

  // Ranked-spot text the shoot step captured, for the AI to write from.
  let regionsData = [];
  try { regionsData = (JSON.parse(fs.readFileSync('social/bluebird-data.json', 'utf8')).regions) || []; } catch (e) {}
  const ordered = toPost.map(k => regionsData.find(d => d.key === k) || { key: k, text: '' });

  const caption = (await aiCaption(ordered)) || FALLBACK;
  console.log('caption:\n' + caption + '\n---');

  // 1) upload each screenshot as an UNPUBLISHED photo → collect media ids
  const media = [];
  for (const r of toPost) {
    const url = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/social/bluebird-${r}.png` + (BUST ? `?v=${BUST}` : '');
    const ph = await fbPost(`/${PAGE}/photos`, { url, published: 'false', access_token: TOKEN });
    media.push(ph.id);
    console.log('uploaded', r, ph.id);
  }

  // 2) one feed post: the AI caption + all screenshots attached as a gallery
  const params = { message: caption, access_token: TOKEN };
  media.forEach((id, i) => { params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id }); });
  const post = await fbPost(`/${PAGE}/feed`, params);
  console.log('PUBLISHED ✓ facebook post', post.id);
})().catch(e => { console.error('FB post failed:', e.message || e); process.exit(1); });
