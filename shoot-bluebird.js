// Bluebird daily IG — screenshots the REAL app's BEST DIVING SPOT view.
// Loads the live app (bluebirdday.app), opens the BEST SPOT tab, picks each
// region + tomorrow's day, waits for all its spots to score, and screenshots
// the hero + runners-up at phone-portrait 1080x1350. Always in sync with the app.
const {chromium}=require('playwright');
const fs=require('fs');
const APP=process.env.APP_URL || 'https://bluebirdday.app';
const REGIONS=[
  {key:'qld', label:'Australia — Queensland'},
  {key:'nsw', label:'Australia — New South Wales'},
  {key:'wa',  label:'Australia — Western Australia'},
];
// "Next day" = tomorrow in Brisbane. Match the day chip by its day-of-month so
// it's correct regardless of the runner's timezone (CI runs in UTC).
const bne=new Date(new Date().toLocaleString('en-US',{timeZone:'Australia/Brisbane'}));
bne.setDate(bne.getDate()+1);
const TARGET_DOM=String(bne.getDate());

(async()=>{
  fs.mkdirSync('social',{recursive:true});
  const b=await chromium.launch();
  const valid=[];
  for(const r of REGIONS){
    const p=await b.newPage({viewport:{width:540,height:675},deviceScaleFactor:2,timezoneId:'Australia/Brisbane'});
    try{
      await p.goto(APP,{waitUntil:'domcontentloaded',timeout:60000});
      // wait for the React app to render its tabs
      await p.waitForFunction(()=>[...document.querySelectorAll('button')].some(x=>/BEST SPOT/.test(x.innerText)),{timeout:30000});
      // open BEST SPOT tab
      await p.evaluate(()=>{ const x=[...document.querySelectorAll('button')].find(b=>/BEST SPOT/.test(b.innerText)); x&&x.click(); });
      await p.waitForSelector('select',{timeout:15000});
      // The app auto-loads its default region (Queensland) on mount. Wait for
      // that to FULLY finish before switching, otherwise its in-flight fetch
      // overwrites the region we switch to (or starves it). One region at a time.
      const loaded=()=>{ const t=document.body.innerText; return t.includes('View full forecast') && !/Scoring \d+ spots/.test(t); };
      await p.waitForFunction(loaded,{timeout:90000});
      // switch to the target region (selecting the same value for QLD is a no-op)
      await p.selectOption('select', r.label);
      if(r.key!=='qld'){
        // wait for the new region's load to kick in (old hero clears / progress shows)
        await p.waitForFunction(()=>{ const t=document.body.innerText; return /Scoring \d+ spots/.test(t) || !t.includes('View full forecast'); },{timeout:20000}).catch(()=>{});
      }
      // wait for the TARGET region to finish loading (loaded AND dropdown shows it)
      await p.waitForFunction((label)=>{ const t=document.body.innerText; const s=document.querySelector('select'); return t.includes('View full forecast') && !/Scoring \d+ spots/.test(t) && s && s.value===label; },{timeout:90000}, r.label);
      // pick tomorrow's day chip (matched by day-of-month) and let it re-rank
      await p.evaluate((dom)=>{
        const btns=[...document.querySelectorAll('button')].filter(b=>/^(TODAY|MON|TUE|WED|THU|FRI|SAT|SUN)/.test(b.innerText.trim()));
        const t=btns.find(b=>b.innerText.trim().split('\n').pop()===dom);
        t&&t.click();
      }, TARGET_DOM);
      await p.waitForTimeout(1200);
      // hide the fixed "Beta" disclaimer bar / any high-z toast so it's not in the shot
      await p.evaluate(()=>{
        [...document.querySelectorAll('body *')].forEach(el=>{
          const s=getComputedStyle(el);
          if(s.position==='fixed'){
            const t=el.innerText||'';
            if(/Beta|Feedback|accept the Terms|Add to Home|Install/i.test(t) || parseInt(s.zIndex||'0')>1000) el.style.display='none';
          }
        });
      });
      await p.waitForTimeout(200);
      await p.screenshot({path:`social/bluebird-${r.key}.png`, clip:{x:0,y:0,width:540,height:675}});
      valid.push(r.key);
      console.log('shot',r.key);
    }catch(e){ console.log('skip',r.key,e.message); }
    await p.close();
  }
  // canonical order qld,nsw,wa -> IG grid reads (left->right) WA, NSW, QLD
  fs.writeFileSync('social/regions.json', JSON.stringify(valid));
  console.log('regions with scores:', valid.join(',')||'(none)');
  await b.close();
})().catch(e=>{console.error(e.message);process.exit(1)});
