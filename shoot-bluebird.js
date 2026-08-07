// Bluebird daily IG/FB — screenshots the REAL app's BEST DIVING SPOT view.
// Loads the live app (bluebirdday.app) ONCE, opens the BEST SPOT tab, then for
// each region picks it + the coming Saturday, WAITS UNTIL EVERY SPOT IS SCORED,
// and screenshots the hero + runners-up at phone-portrait.
//
// Why the wait matters: the Best Spot view scores every spot in the region by
// calling the worker. Big regions (QLD 27, NSW 19) take a while and, in the CI
// runner, some score requests get rate-limited. The old script screenshotted the
// moment a hero appeared, so it captured half-scored regions (e.g. QLD at 2/27,
// NSW missing). Now we read the app's own "Scored N spots" counter against the
// region total (the "(27)" in the dropdown) and only shoot once it's complete —
// pausing + re-scoring to recover throttled spots. WA (6 spots) finishes first
// try; the retries rescue the large regions.
// Also dumps social/bluebird-data.json (ranked-spot TEXT per region) for the caption.
const {chromium}=require('playwright');
const fs=require('fs');
const APP=process.env.APP_URL || 'https://bluebirdday.app';
const REGIONS=[
  {key:'qld', label:'Australia — Queensland — Southeast'},
  {key:'nsw', label:'Australia — New South Wales'},
  {key:'wa',  label:'Australia — Western Australia — Perth & Coral Coast'},
];
// Post the COMING SATURDAY's forecast. Match the day chip by its day-of-month so
// it's correct regardless of timezone. Browser runs in Brisbane time.
const bne=new Date(new Date().toLocaleString('en-US',{timeZone:'Australia/Brisbane'}));
bne.setDate(bne.getDate() + ((6 - bne.getDay() + 7) % 7)); // jump to the coming Saturday
const TARGET_DOM=String(bne.getDate());

// Read the app's scoring state for the currently-selected region. Self-contained
// so it can be serialized into the page by p.evaluate().
//   total  = spot count of the selected region (the "(27)" in the dropdown option)
//   scored = the app's "Scored N spots" counter
function readState(label){
  const t=document.body.innerText;
  const sel=document.querySelector('select');
  const opt=sel && [...sel.options].find(o=>o.value===label);
  const totalM=opt && opt.text.match(/\((\d+)\)/);
  const scoredM=t.match(/Scored (\d+) spots/);
  return {
    total:  totalM ? parseInt(totalM[1],10) : null,
    scored: scoredM ? parseInt(scoredM[1],10) : 0,
    scoring: /Scoring \d+ spots/.test(t),
    loaded: t.includes('View full forecast'),
    right:  !!(sel && sel.value===label),
  };
}

(async()=>{
  fs.mkdirSync('social',{recursive:true});
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:540,height:675},deviceScaleFactor:2,timezoneId:'Australia/Brisbane'});
  const valid=[];
  const data=[];

  // Wait until the selected region has SETTLED (loaded, correct region, not
  // mid-scoring), or timeout. Returns the last state read either way.
  const settled=async(label,timeout)=>{
    const start=Date.now();
    let s=await p.evaluate(readState,label);
    while(Date.now()-start<timeout){
      s=await p.evaluate(readState,label);
      if(s.right && s.loaded && !s.scoring) return s;
      await p.waitForTimeout(1000);
    }
    return s;
  };

  // Re-trigger scoring for the current region. Prefer the ↻ re-score control next
  // to "BEST DIVING SPOT"; fall back to re-clicking the current day chip. Spots
  // already scored come back from cache instantly; the ones that failed retry.
  const rescore=async(dom)=>{
    return p.evaluate((dom)=>{
      let el=[...document.querySelectorAll('button,[role="button"],span,div,a')]
        .find(e=>((e.innerText||e.textContent||'').trim()==='↻'));
      if(el){ try{el.click(); return '↻';}catch(e){} }
      const btns=[...document.querySelectorAll('button')].filter(x=>/^(TODAY|MON|TUE|WED|THU|FRI|SAT|SUN)/.test(x.innerText.trim()));
      const t=btns.find(x=>x.innerText.trim().split('\n').pop()===dom);
      if(t){ t.click(); return 'daychip'; }
      return 'none';
    }, dom);
  };

  try{
    await p.goto(APP,{waitUntil:'domcontentloaded',timeout:60000});
    // the app compiles its JSX in-browser (Babel-standalone) — can take a while on CI
    await p.waitForFunction(()=>[...document.querySelectorAll('button')].some(x=>/BEST SPOT/.test(x.innerText)), undefined, {timeout:120000});
    await p.evaluate(()=>{ const x=[...document.querySelectorAll('button')].find(b=>/BEST SPOT/.test(b.innerText)); x&&x.click(); });
    await p.waitForSelector('select',{timeout:15000});
    // let the default region settle before touching anything
    await settled(REGIONS[0].label, 120000);

    for(const r of REGIONS){
      try{
        // reset zoom in case a previous region left it scaled
        await p.evaluate(()=>{ document.documentElement.style.zoom='1'; });
        // set the region (React-safe native setter + change event)
        const changed=await p.evaluate((label)=>{
          const sel=document.querySelector('select'); if(!sel) return false;
          if(sel.value===label) return false;
          const setter=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set;
          setter.call(sel,label);
          sel.dispatchEvent(new Event('change',{bubbles:true}));
          return true;
        }, r.label);
        if(changed){
          await p.waitForFunction(()=>{ const t=document.body.innerText; return /Scoring \d+ spots/.test(t) || !t.includes('View full forecast'); }, undefined, {timeout:20000}).catch(()=>{});
        }
        await settled(r.label, 120000);
        // pick the coming Saturday's day chip and let it re-rank/re-score
        await p.evaluate((dom)=>{
          const btns=[...document.querySelectorAll('button')].filter(b=>/^(TODAY|MON|TUE|WED|THU|FRI|SAT|SUN)/.test(b.innerText.trim()));
          const t=btns.find(b=>b.innerText.trim().split('\n').pop()===dom);
          t&&t.click();
        }, TARGET_DOM);
        await p.waitForTimeout(1500);

        // Wait for settle, then keep pausing + re-scoring until every spot is in.
        let s=await settled(r.label, 120000);
        for(let tries=0; s.total && s.scored < s.total && tries<3; tries++){
          console.log(`  ${r.key} ${s.scored}/${s.total} — pause + re-score (try ${tries+1})`);
          await p.waitForTimeout(12000);            // let the per-IP rate window clear
          const how=await rescore(TARGET_DOM);
          await p.waitForTimeout(2500);
          s=await settled(r.label, 90000);
          console.log(`  ${r.key} re-score via ${how} -> ${s.scored}/${s.total}`);
        }
        console.log(`  ${r.key} final ${s.scored}/${s.total==null?'?':s.total}`);

        // Keep a region only if scored well enough — better to drop it than post a
        // misleading "best of 2". Require full, or >=60% (with at least 5 spots).
        const enough = s.total && s.scored >= Math.max(5, Math.ceil(s.total*0.6));
        if(!enough){ console.log('  skip',r.key,'— too few scored',s.scored,'/',s.total); continue; }

        // capture ranked-spot TEXT (hero + runners-up) for the caption
        const text=await p.evaluate(()=>{ const t=document.body.innerText; const i=t.indexOf('BEST DIVING SPOT'); return (i>=0?t.slice(i):t).slice(0,2000); });
        // slight zoom out so the top 5 spots fit the phone-portrait clip
        await p.evaluate(()=>{ document.documentElement.style.zoom='0.85'; });
        await p.waitForTimeout(400);
        // hide any fixed disclaimer / toast bar
        await p.evaluate(()=>{
          [...document.querySelectorAll('body *')].forEach(el=>{
            const st=getComputedStyle(el);
            if(st.position==='fixed'){
              const t=el.innerText||'';
              if(/Beta|Feedback|accept the Terms|Add to Home|Install/i.test(t) || parseInt(st.zIndex||'0')>1000) el.style.display='none';
            }
          });
        });
        await p.waitForTimeout(300);
        await p.screenshot({path:`social/bluebird-${r.key}.png`, clip:{x:0,y:0,width:540,height:675}});
        valid.push(r.key);
        data.push({key:r.key, label:r.label, text, scored:s.scored, total:s.total});
        console.log('shot',r.key);
      }catch(e){ console.log('skip',r.key,e.message); }
    }
  }catch(e){ console.log('fatal',e.message); }
  await p.close();
  // canonical order qld,nsw,wa -> IG grid reads (left->right) WA, NSW, QLD
  fs.writeFileSync('social/regions.json', JSON.stringify(valid));
  fs.writeFileSync('social/bluebird-data.json', JSON.stringify({targetDOM:TARGET_DOM, regions:data}));
  console.log('regions with scores:', valid.join(',')||'(none)');
  await b.close();
})().catch(e=>{console.error(e.message);process.exit(1)});
