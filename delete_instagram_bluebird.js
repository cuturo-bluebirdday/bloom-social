// Bluebird IG — delete recent posts.
// Fetches the last N media items from the Bluebird IG account and deletes any
// whose caption starts with "🤿" (i.e. posted by this pipeline).
// Set HOURS_BACK env var to control the window (default: 48h).
// Run via GitHub Actions so credentials never leave secrets.
const IG    = process.env.IG_USER_ID;
const TOKEN = process.env.IG_ACCESS_TOKEN;
const HOURS = parseInt(process.env.HOURS_BACK || '48', 10);
const V     = 'v21.0';
const G     = `https://graph.facebook.com/${V}`;

async function apiFetch(path, params = {}, method = 'GET') {
  const u = new URL(G + path);
  u.searchParams.set('access_token', TOKEN);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u, { method });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(path + ' → ' + JSON.stringify(j.error || j));
  return j;
}

(async () => {
  if (!IG || !TOKEN) throw new Error('Missing IG_USER_ID / IG_ACCESS_TOKEN');

  // Fetch recent media (up to 50)
  const feed = await apiFetch(`/${IG}/media`, {
    fields: 'id,caption,timestamp',
    limit:  '50',
  });
  const items = feed.data || [];
  console.log(`Found ${items.length} recent posts`);

  const cutoff = Date.now() - HOURS * 60 * 60 * 1000;
  const toDelete = items.filter(p => {
    const ts = new Date(p.timestamp).getTime();
    return ts >= cutoff && (p.caption || '').startsWith('🤿');
  });

  if (!toDelete.length) {
    console.log(`No Bluebird posts in the last ${HOURS}h to delete.`);
    return;
  }

  console.log(`Deleting ${toDelete.length} post(s)…`);
  for (const p of toDelete) {
    try {
      await apiFetch(`/${p.id}`, {}, 'DELETE');
      const preview = (p.caption || '').slice(0, 60).replace(/\n/g, ' ');
      console.log(`  ✓ deleted ${p.id}  (${p.timestamp})  "${preview}"`);
    } catch (e) {
      console.log(`  ✗ failed  ${p.id}: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log('done');
})().catch(e => { console.error('delete failed:', e.message || e); process.exit(1); });
