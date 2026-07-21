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
// "Next day" = tomorrow in Brisbane. Match the day chip by its day-of-month so
// it's correct regardless of the runner's timezone. The browser runs in
// Brisbane time so the app's own "TODAY" chip lines up too.
const bne=new Date(new Date().toLocaleString('en-US',{timeZone:'Australia/Brisbane'}));
bne.setDate(bne.getDate()+1);
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
        // hide the fixed "Beta" disclaimer bar / any high-z toast
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
    }
  }catch(e){ console.log('fatal',e.message); }
  await p.close();
  // canonical order qld,nsw,wa -> IG grid reads (left->right) WA, NSW, QLD
  fs.writeFileSync('social/regions.json', JSON.stringify(valid));
  console.log('regions with scores:', valid.join(',')||'(none)');
  await b.close();
})().catch(e=>{console.error(e.message);process.exit(1)});
