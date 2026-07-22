// Bluebird daily IG — posts ONE separate single-image post per region.
// Order qld -> nsw -> wa (oldest -> newest) so the profile grid reads,
// left -> right: WA (newest, top-left), NSW, QLD. Each post gets its own
// region hashtags. Self-contained; doesn't touch Bloom's post_instagram.js.
// Images must already be committed to social/ (Instagram fetches by PUBLIC URL).
const fs = require('fs');
const IG    = process.env.IG_USER_ID;
const TOKEN = process.env.IG_ACCESS_TOKEN;
const REPO   = process.env.GITHUB_REPOSITORY || 'cuturo-bluebirdday/bloom-social';
const BRANCH = process.env.GITHUB_REF_NAME   || 'main';
const BUST   = process.env.GITHUB_RUN_ID     || '';   // cache-buster so raw CDN never serves a stale card
const V = 'v21.0';
const G = `https://graph.facebook.com/${V}`;

// Canonical post order. Grid fills newest-first from top-left, so posting
// qld first and wa last puts WA on the left, NSW centre, QLD on the right.
const ORDER = ['qld','nsw','wa'];
const REGION = {
  qld: { name:'Queensland',        tags:'#queensland #goldcoast #sunshinecoast #straddie #moretonbay #brisbane #greatbarrierreef' },
  nsw: { name:'New South Wales',   tags:'#sydney #newsouthwales #byronbay #maroubra #manly #shellybeach #jervisbay' },
  wa:  { name:'Western Australia', tags:'#perth #westernaustralia #rottnest #ningaloo #exmouth #coralbay #busselton' },
};
const COMMON = '#freediving #spearfishing #scuba #diving #ocean #oceanconditions #australia #divelife #saltlife';

function caption(r){
  const m = REGION[r];
  return `🤿 This Saturday's best dive spots — ${m.name}.

One honest score, 1–7: swell, wind, water clarity, tide & moon — combined into a single number. Free, no account.

🔗 bluebirdday.app

${m.tags} ${COMMON}`;
}

async function post(path, params){
  const u = new URL(G + path);
  Object.entries(params).forEach(([k,v]) => u.searchParams.set(k, v));
  const r = await fetch(u, { method:'POST' });
  const j = await r.json().catch(()=> ({}));
  if(!r.ok || j.error) throw new Error(path + ' -> ' + JSON.stringify(j.error || j));
  return j;
}
async function waitReady(id){
  for(let i=0;i<25;i++){
    const u = new URL(`${G}/${id}`);
    u.searchParams.set('fields','status_code');
    u.searchParams.set('access_token', TOKEN);
    const j = await fetch(u).then(r=>r.json()).catch(()=>({}));
    if(j.status_code === 'FINISHED') return;
    if(j.status_code === 'ERROR')   throw new Error('container ERROR: ' + id);
    await new Promise(r=>setTimeout(r, 3000));
  }
  throw new Error('container not ready in time: ' + id);
}
(async () => {
  if(!IG || !TOKEN) throw new Error('Missing IG_USER_ID / IG_ACCESS_TOKEN secrets');

  // Only post regions the shoot step produced a card for (skips empty/no-score regions).
  let valid = ORDER;
  try { valid = JSON.parse(fs.readFileSync('social/regions.json','utf8')); } catch(e){}
  const toPost = ORDER.filter(r => valid.includes(r));
  if(!toPost.length) throw new Error('No region cards to post (social/regions.json empty)');

  for(const r of toPost){
    const image_url = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/social/bluebird-${r}.png` + (BUST ? `?v=${BUST}` : '');
    const c = await post(`/${IG}/media`, { image_url, caption: caption(r), access_token: TOKEN });
    await waitReady(c.id);
    const pub = await post(`/${IG}/media_publish`, { creation_id: c.id, access_token: TOKEN });
    console.log('PUBLISHED ✓', r, pub.id);
    // small gap so IG processes posts in order and doesn't rate-limit bursts
    await new Promise(res => setTimeout(res, 4000));
  }
  console.log('done:', toPost.join(','));
})().catch(e => { console.error('IG post failed:', e.message || e); process.exit(1); });
