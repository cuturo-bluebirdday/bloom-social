// Bluebird daily IG — screenshots the REAL app's BEST DIVING SPOT view.
// Loads the live app (bluebirdday.app) ONCE, opens the BEST SPOT tab, then for
// each region picks it + tomorrow's day, waits for all its spots to score, and
// screenshots the hero + runners-up at phone-portrait 1080x1350.
// Single page so the in-browser Babel/React compile happens only once.
const {chromium}=require('playwright');
const fs=require('fs');
const APP=process.env.APP_URL || 'https://bluebirdday.app';
const REGIONS=[
  {key:'qld', label:'Australia — Queensland'},
  {key:'nsw', label:'Australia — New South Wales'},
  {key:'wa',  label:'Australia — Western Australia'},
];
// Post the COMING SATURDAY's forecast (the job runs Wednesday, so people get a
// few days to plan the weekend). Match the day chip by its day-of-month so it's
// correct regardless of the runner's timezone. The browser runs in Brisbane time
// so the app's own day chips line up.
const bne=new Date(new Date().toLocaleString('en-US',{timeZone:'Australia/Brisbane'}));
bne.setDate(bne.getDate() + ((6 - bne.getDay() + 7) % 7)); // jump to the coming Saturday (0=Sun..6=Sat)
const TARGET_DOM=String(bne.getDate());

const LOADED=()=>{ const t=document.body.innerText; return t.includes('View full forecast') && !/Scoring \d+ spots/.test(t); };

(async()=>{
  fs.mkdirSync('social',{recursive:true});
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:540,height:675},deviceScaleFactor:2,timezoneId:'Australia/Brisbane'});
  const valid=[];
  try{
    await p.goto(APP,{waitUntil:'domcontentloaded',timeout:60000});
    // the app compiles its JSX in-browser (Babel-standalone) — can take a while on CI
    await p.waitForFunction(()=>[...document.querySelectorAll('button')].some(x=>/BEST SPOT/.test(x.innerText)), undefined, {timeout:120000});
    await p.evaluate(()=>{ const x=[...document.querySelectorAll('button')].find(b=>/BEST SPOT/.test(b.innerText)); x&&x.click(); });
    await p.waitForSelector('select',{timeout:15000});
    // let the default region (Queensland) auto-load fully before touching anything
    await p.waitForFunction(LOADED, undefined, {timeout:90000});

    for(const r of REGIONS){
      try{
        // set the region with a native setter + change event (React-safe, no
        // Playwright selectOption timeout). Returns true if it actually changed.
        const changed=await p.evaluate((label)=>{
          const sel=document.querySelector('select'); if(!sel) return false;
          if(sel.value===label) return false;
          const setter=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set;
          setter.call(sel,label);
          sel.dispatchEvent(new Event('change',{bubbles:true}));
          return true;
        }, r.label);
        if(changed){
          // wait for the switch to kick in (old hero clears / progress shows)
          await p.waitForFunction(()=>{ const t=document.body.innerText; return /Scoring \d+ spots/.test(t) || !t.includes('View full forecast'); }, undefined, {timeout:20000}).catch(()=>{});
        }
        // wait for THIS region to finish loading (loaded AND dropdown shows it)
        await p.waitForFunction((label)=>{ const t=document.body.innerText; const s=document.querySelector('select'); return t.includes('View full forecast') && !/Scoring \d+ spots/.test(t) && s && s.value===label; }, r.label, {timeout:90000});
        // pick tomorrow's day chip (matched by day-of-month) and let it re-rank
        await p.evaluate((dom)=>{
          const btns=[...document.querySelectorAll('button')].filter(b=>/^(TODAY|MON|TUE|WED|THU|FRI|SAT|SUN)/.test(b.innerText.trim()));
          const t=btns.find(b=>b.innerText.trim().split('\n').pop()===dom);
          t&&t.click();
        }, TARGET_DOM);
        await p.waitForTimeout(1200);
        // Zoom out to ~50% so ~8 spots are visible instead of ~4
        await p.evaluate(()=>{ document.documentElement.style.zoom='0.5'; });
        await p.waitForTimeout(400);
        // hide the fixed "Beta" disclaimer bar / any high-z toast
        await p.evaluate(()=>{
          [...document.querySelectorAll('body *')].forEach(el=>{
            if(el.id==='bb-watermark') return; // never hide our own stamp
            const s=getComputedStyle(el);
            if(s.position==='fixed'){
              const t=el.innerText||'';
              if(/Beta|Feedback|accept the Terms|Add to Home|Install/i.test(t) || parseInt(s.zIndex||'0')>1000) el.style.display='none';
            }
          });
        });
        await p.waitForTimeout(200);
        // stamp the website on the image so it travels with any repost/screenshot
        await p.evaluate(()=>{
          let w=document.getElementById('bb-watermark');
          if(!w){ w=document.createElement('div'); w.id='bb-watermark'; document.body.appendChild(w); }
          w.textContent='bluebirdday.app';
          // at zoom:0.5 + dSF:2, 1 CSS px ≈ 1 screenshot pixel, so these sizes are literal
          Object.assign(w.style,{position:'fixed',left:'50%',bottom:'18px',transform:'translateX(-50%)',
            zIndex:'2147483647',background:'rgba(11,22,40,0.88)',color:'#fff',
            font:'700 22px -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif',letterSpacing:'0.5px',
            padding:'10px 28px',borderRadius:'999px',pointerEvents:'none',display:'block',
            boxShadow:'0 3px 14px rgba(0,0,0,0.45)'});
        });
        await p.waitForTimeout(120);
        await p.screenshot({path:`social/bluebird-${r.key}.png`, clip:{x:0,y:0,width:540,height:675}});
        valid.push(r.key);
        console.log('shot',r.key);
      }catch(e){ console.log('skip',r.key,e.message); }
    }
  }catch(e){ console.log('fatal',e.message); }
  await p.close();
  // canonical order qld,nsw,wa -> IG grid reads (left->right) WA, NSW, QLD
  fs.writeFileSync('social/regions.json', JSON.stringify(valid));
  console.log('regions with scores:', valid.join(',')||'(none)');
  await b.close();
})().catch(e=>{console.error(e.message);process.exit(1)});
