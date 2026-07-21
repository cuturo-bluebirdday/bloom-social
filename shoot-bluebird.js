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
    const p=await b.newPage({viewport:{width:540,height:675},deviceScaleFactor:2});
    try{
      await p.goto(APP,{waitUntil:'domcontentloaded',timeout:60000});
      // wait for the React app to render its tabs
      await p.waitForFunction(()=>[...document.querySelectorAll('button')].some(x=>/BEST SPOT/.test(x.innerText)),{timeout:30000});
      // open BEST SPOT tab
      await p.evaluate(()=>{ const x=[...document.querySelectorAll('button')].find(b=>/BEST SPOT/.test(b.innerText)); x&&x.click(); });
      await p.waitForSelector('select',{timeout:15000});
      // choose the region
      await p.selectOption('select', r.label);
      await p.waitForTimeout(400);
      // choose tomorrow's day chip (matched by day-of-month)
      await p.evaluate((dom)=>{
        const btns=[...document.querySelectorAll('button')].filter(b=>/^(TODAY|MON|TUE|WED|THU|FRI|SAT|SUN)/.test(b.innerText.trim()));
        const t=btns.find(b=>b.innerText.trim().split('\n').pop()===dom);
        t&&t.click();
      }, TARGET_DOM);
      // wait until the region finishes scoring (hero card renders)
      await p.waitForFunction(()=>document.body.innerText.includes('View full forecast'),{timeout:75000});
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
