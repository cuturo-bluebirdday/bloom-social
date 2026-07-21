// Bluebird daily IG — screenshots the 3 regional report cards at 1080x1350.
// Mirrors Bloom's shoot.js. Loads the DEPLOYED report so it pulls live scores.
const {chromium}=require('playwright');
const REGIONS=['qld','nsw','wa'];
const BASE=process.env.REPORT_URL||'https://bluebirdday.app/bluebird-report.html';
(async()=>{
  const fs=require('fs'); fs.mkdirSync('social',{recursive:true});
  const b=await chromium.launch();
  for(const r of REGIONS){
    const p=await b.newPage({viewport:{width:1080,height:1350},deviceScaleFactor:1.5});
    await p.goto(`${BASE}?region=${r}`,{waitUntil:'networkidle',timeout:60000}).catch(e=>console.log('nav',r,e.message));
    await p.waitForFunction(()=>document.body.getAttribute('data-ready')==='1',{timeout:30000}).catch(()=>console.log(r,'not-ready'));
    await p.waitForTimeout(1500);
    await p.screenshot({path:`social/bluebird-${r}.png`});
    await p.close();
    console.log('shot',r);
  }
  await b.close();
})().catch(e=>{console.error(e.message);process.exit(1)});
