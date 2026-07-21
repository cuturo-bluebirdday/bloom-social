// Bluebird daily IG — screenshots the 3 regional report cards at 1080x1350.
// Self-contained: serves bluebird-report.html locally and screenshots it, so
// nothing needs to be deployed to a website. Live scores come from the worker.
const {chromium}=require('playwright');
const http=require('http'), fs=require('fs'), path=require('path');
const REGIONS=['qld','nsw','wa'];
const PORT=8199;
function serve(){return new Promise(res=>{const s=http.createServer((req,rq)=>{
  let f=req.url.split('?')[0]; if(f==='/')f='/bluebird-report.html';
  const p=path.join(process.cwd(),f);
  fs.readFile(p,(e,d)=>{ if(e){rq.writeHead(404);rq.end();return;}
    rq.writeHead(200,{'content-type':f.endsWith('.html')?'text/html; charset=utf-8':'application/octet-stream'}); rq.end(d); });
}); s.listen(PORT,()=>res(s));});}
(async()=>{
  fs.mkdirSync('social',{recursive:true});
  const srv=await serve();
  const b=await chromium.launch();
  const valid=[];
  for(const r of REGIONS){
    const p=await b.newPage({viewport:{width:1080,height:1350},deviceScaleFactor:1.5});
    await p.goto(`http://127.0.0.1:${PORT}/bluebird-report.html?region=${r}`,{waitUntil:'networkidle',timeout:60000}).catch(e=>console.log('nav',r,e.message));
    await p.waitForFunction(()=>document.body.getAttribute('data-ready')==='1',{timeout:30000}).catch(()=>console.log(r,'not-ready'));
    await p.waitForTimeout(1500);
    const has=await p.evaluate(()=>document.body.getAttribute('data-hasscores')==='1').catch(()=>false);
    if(has){ await p.screenshot({path:`social/bluebird-${r}.png`}); valid.push(r); console.log('shot',r); }
    else { console.log('skip (no scores)',r); }
    await p.close();
  }
  // Canonical order qld,nsw,wa is preserved -> IG grid reads (left->right) WA, NSW, QLD.
  fs.writeFileSync('social/regions.json', JSON.stringify(valid));
  console.log('regions with scores:', valid.join(',')||'(none)');
  await b.close(); srv.close();
})().catch(e=>{console.error(e.message);process.exit(1)});
