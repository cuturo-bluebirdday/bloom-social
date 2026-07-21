// Bluebird daily IG — posts the 3 regional cards as a carousel.
// Self-contained (doesn't touch Bloom's post_instagram.js). Standard IG Graph API.
// Images must already be committed to social/ (Instagram fetches them by PUBLIC URL).
const IG    = process.env.IG_USER_ID;
const TOKEN = process.env.IG_ACCESS_TOKEN;
const REPO   = process.env.GITHUB_REPOSITORY || 'cuturo-bluebirdday/bloom-social';
const BRANCH = process.env.GITHUB_REF_NAME   || 'main';
const V = 'v21.0';
const G = `https://graph.facebook.com/${V}`;
const FILES = ['bluebird-qld.png','bluebird-nsw.png','bluebird-wa.png'];
const CAPTION =
`🤿 Today's best dive spots — Queensland, NSW & Western Australia.

One honest score, 1–7: swell, wind, water clarity, tide & moon — combined into a single number. Free, no account. Full 7-day forecast for any spot at bluebirdday.app

#freediving #spearfishing #scuba #diving #australia #oceanconditions #divelife #saltlife`;

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
  const children = [];
  for(const f of FILES){
    const image_url = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/social/${f}`;
    const c = await post(`/${IG}/media`, { image_url, is_carousel_item:'true', access_token:TOKEN });
    await waitReady(c.id);
    children.push(c.id);
    console.log('carousel item ok:', f, c.id);
  }
  const carousel = await post(`/${IG}/media`, {
    media_type:'CAROUSEL', children: children.join(','), caption: CAPTION, access_token: TOKEN
  });
  await waitReady(carousel.id);
  const pub = await post(`/${IG}/media_publish`, { creation_id: carousel.id, access_token: TOKEN });
  console.log('PUBLISHED ✓', pub.id);
})().catch(e => { console.error('IG post failed:', e.message || e); process.exit(1); });
