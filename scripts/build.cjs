const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.join(__dirname,'..');
process.chdir(root);
const read=p=>fs.readFileSync(p,'utf8');
const write=(p,s)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,s);};
// Only the two icon weights already used by the site are shipped.
for(const weight of ['bold','fill']) {
  const source=`node_modules/@phosphor-icons/web/src/${weight}`;
  const css=read(`${source}/style.css`).replace(/src:\s*[\s\S]*?;/,m=>m.includes('url(')?`src: url("./Phosphor-${weight==='bold'?'Bold':'Fill'}.woff2") format("woff2");`:m);
  write(`assets/icons/${weight}/style.css`,css);
  const file=`Phosphor-${weight==='bold'?'Bold':'Fill'}.woff2`;
  fs.copyFileSync(`${source}/${file}`,`assets/icons/${weight}/${file}`);
}
fs.copyFileSync('node_modules/@phosphor-icons/web/LICENSE','assets/icons/LICENSE');
execFileSync(process.execPath,['node_modules/tailwindcss/lib/cli.js','-i','assets/input.css','-o','assets/site.css','--minify'],{stdio:'inherit'});
const context=vm.createContext({console,URL,URLSearchParams,Date,Intl,setTimeout,clearTimeout,
  document:{addEventListener(){}},addEventListener(){},location:{pathname:'/',search:''}});
context.window=context;
for(const file of ['domain','data','app'])vm.runInContext(read(`assets/${file}.js`),context);
vm.runInContext('state.isLoading=false',context);
let html=read('index.html');
html=html.replace(/(<main\b[^>]*id="main-content"[^>]*>)[\s\S]*?<\/main>/,(_,tag)=>tag+context.getHomeHTML()+'<noscript><p>即時日期與票價需要啟用 JavaScript，實際機位請聯繫旅行社確認。</p></noscript></main>');
html=html.replace(/((?:src|href)="\/assets\/([^"?]+))(?:\?v=[^"]+)?"/g,(_,attr,file)=>`${attr}?v=${crypto.createHash('sha256').update(fs.readFileSync('assets/'+file)).digest('hex').slice(0,12)}"`);
write('index.html',html);
const destinations=[
  {slug:'osaka',name:'大阪',country:'japan',tab:'kansai',text:'整理桃園、高雄等出發地的大阪機票與旅行團資訊。適合規劃大阪、京都及神戶行程的旅客；請先確認出發機場、旅遊天數、去回程航班及行李額度。'},
  {slug:'okinawa',name:'沖繩',country:'japan',tab:'okinawa',text:'整理沖繩機票與旅行團資訊，適合親子、海邊度假與自駕旅客。查詢時請確認抵達機場、航班時間、行李額度與住宿交通安排。'},
  {slug:'seoul',name:'首爾',country:'korea',tab:'seoul',text:'整理首爾機票與旅行團資訊，適合城市散步、購物與美食旅行。請確認出發機場、抵達仁川或金浦、回程航班及機場交通時間。'}
];
for(const d of destinations) {
  const url=`https://www.eddietour.tw/destinations/${d.slug}/`;
  const title=`${d.name}清艙機票與旅行團｜艾迪王旅遊秘笈`;
  let page=html.replace(/<title>[\s\S]*?<\/title>/,`<title>${title}</title>`)
    .replace(/(<meta (?:name="(?:description|twitter:description)"|property="og:description") content=")[^"]*"/g,`$1${d.text}"`)
    .replace(/(<meta (?:name="twitter:title"|property="og:title") content=")[^"]*"/g,`$1${title}"`)
    .replace(/(<link rel="canonical" href=")[^"]*"/,`$1${url}"`)
    .replace(/(<meta property="og:url" content=")[^"]*"/,`$1${url}"`);
  const body=`<section><h1 class="text-3xl font-black text-gray-900 mb-4">${d.name}清艙機票與旅行團</h1><p class="text-gray-600 leading-relaxed mb-6">${d.text}</p><p class="text-sm text-gray-500 mb-6">即時票價載入後，可按出發地、月份與商品類型篩選。票價、航班與機位依旅行社確認為準。</p><a class="text-blue-600 underline" href="/?country=${d.country}&tab=${d.tab}">查看${d.name}日期與參考票價</a><p class="mt-6"><a href="/">返回全部目的地</a></p></section>`;
  page=page.replace(/(<main\b[^>]*id="main-content"[^>]*>)[\s\S]*?<\/main>/,(_,tag)=>tag+body+'</main>');
  write(`destinations/${d.slug}/index.html`,page);
}
write('sitemap.xml','<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+['','miyazaki.html','Fukusaki.html',...destinations.map(d=>`destinations/${d.slug}/`)].map(p=>`  <url><loc>https://www.eddietour.tw/${p}</loc></url>`).join('\n')+'\n</urlset>\n');
write('robots.txt','User-agent: *\nAllow: /\nSitemap: https://www.eddietour.tw/sitemap.xml\n');
// Only website assets enter the deploy output; previews, fixtures and local tools stay local.
for(const file of ['index.html','Fukusaki.html','miyazaki.html','robots.txt','sitemap.xml']) {
  fs.mkdirSync('public',{recursive:true}); fs.copyFileSync(file,'public/'+file);
}
fs.cpSync('destinations','public/destinations',{recursive:true});
for(const file of ['domain.js','data.js','app.js','site.css']) {
  fs.mkdirSync('public/assets',{recursive:true});fs.copyFileSync('assets/'+file,'public/assets/'+file);
}
fs.cpSync('assets/icons','public/assets/icons',{recursive:true});
console.log('Built static CSS, pinned icons, home HTML and 3 destination pages.');
