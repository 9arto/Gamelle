const {chromium}=require('playwright');const http=require('http'),fs=require('fs'),path=require('path');
const ROOT='/home/user/Gamelle';
const srv=http.createServer((q,r)=>{const f=path.join(ROOT,q.url.split('?')[0].replace(/^\/$/,'/index.html'));if(!fs.existsSync(f)){r.writeHead(404);return r.end()}const t={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'}[path.extname(f)]||'application/octet-stream';r.writeHead(200,{'Content-Type':t});r.end(fs.readFileSync(f))}).listen(0,async()=>{
const b=await chromium.launch();
for (const dark of [false,true]) {
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,serviceWorkers:'block',colorScheme:dark?'dark':'light'});
const p=await ctx.newPage();
await p.route('**/static.jow.fr/**',r=>r.abort());await p.route('**/themealdb.com/**',r=>r.abort());await p.route('**/pexels.com/**',r=>r.abort());
await p.addInitScript((d)=>{localStorage.setItem('gamelle_theme',d?'dark':'light')},dark);
await p.goto(`http://localhost:${srv.address().port}/index.html`);await p.waitForFunction(()=>typeof state!=='undefined'&&state.recipes.length>300);
await p.evaluate(()=>{state.plan=state.recipes.slice(0,5).map(r=>r.id);saveToLocalStorage();renderAll&&renderAll()}).catch(()=>{});
const tag=dark?'dark':'light';
await p.evaluate(()=>switchTab('tab-planning'));await p.screenshot({path:`/tmp/shots/${tag}-planning.png`});
await p.click('[data-menu="planning-more-menu"]');await p.screenshot({path:`/tmp/shots/${tag}-planning-menu.png`});await p.click('body',{position:{x:5,y:600}});
await p.evaluate(()=>{switchTab('tab-courses');addStaple('Lait');addStaple('Lait')});await p.screenshot({path:`/tmp/shots/${tag}-courses.png`});
await p.click('#btn-shop-mode');await p.screenshot({path:`/tmp/shots/${tag}-shop.png`});await p.click('#btn-shop-mode');
await p.evaluate(()=>switchTab('tab-recettes'));await p.screenshot({path:`/tmp/shots/${tag}-recettes.png`});
await p.evaluate(()=>switchTab('tab-reglages')).catch(()=>{});await p.screenshot({path:`/tmp/shots/${tag}-reglages.png`});
await ctx.close();}
await b.close();srv.close();});
