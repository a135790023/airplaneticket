const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {harness,simple}=require('./test-helpers.cjs');
let passed=0;
async function test(name,fn){await fn();console.log('PASS '+name);passed++;}
const gviz=rows=>({status:'ok',table:{cols:Array.from({length:6},()=>({label:''})),rows:rows.map(details=>({c:[null,null,null,null,null,{v:details}]}))}});
const response=data=>({ok:true,text:async()=>JSON.stringify(data)});
(async()=>{
 await test('Split production scripts compile',()=>{for(const name of ['domain','data','app'])new vm.Script(fs.readFileSync('assets/'+name+'.js','utf8'));});
 await test('Booking cutoff remains unchanged and is distinct from expiry/withdrawal',()=>{
   const c=harness().context;
   assert.equal(c.getTicketStatus('2026-11-24','樂桃').reason,'expired');
   assert.equal(c.getTicketStatus('2026-11-25','樂桃').reason,'departure_day');
   assert.equal(c.getTicketStatus('2026-12-04','樂桃').reason,'booking_cutoff');
   assert.equal(c.getTicketStatus('2027-01-12','樂桃',false,{saleStatus:'停售'}).reason,'withdrawn');
   assert.equal(c.getTicketStatus('2027-01-12','樂桃',false,{bookingDeadline:'2026-11-24'}).reason,'booking_closed');
   assert.equal(c.getTicketStatus('2027-01-12','樂桃',false,{saleStatus:'需確認'}).reason,'needs_confirmation');
 });
 await test('A failed tour source cannot block fresh flight prices; failures retain previous source data',async()=>{
   const h=harness(undefined,[{details:simple('樂桃大阪五日')}],[{details:'跟團美西10日\n團費 $110900 出發日：2027/2/4'}]);
   await h.context.fetchSheetData();const tour=h.state().tickets.find(t=>t.isTour);assert(tour);
   h.context.fetch=async url=>{const sheet=new URL(url).searchParams.get('sheet');if(sheet==='旅行團')throw Error('offline');return response(gviz(sheet==='清艙'?[simple('樂桃大阪五日',undefined,undefined,undefined,'12500')]:[]));};
   await h.context.fetchSheetData(true);
   assert(h.state().tickets.some(t=>t.price==='12500'));assert(h.state().tickets.some(t=>t.id===tour.id));
   assert.equal(h.context.sourceFresh('tours'),false);assert.equal(h.context.sourceFresh('flights'),true);
   assert(h.get('sync-status').textContent.includes('更新失敗'));
 });
 await test('Successful empty source removes withdrawn products and never falls back to unapproved hotel responses',async()=>{
   const h=harness(undefined,[{details:simple('樂桃大阪五日')}]);await h.context.fetchSheetData();const old=h.state().tickets[0];
   h.context.showOffer(old.id);const requested=[];
   h.context.fetch=async url=>{requested.push(new URL(url).searchParams.get('sheet'));return response(gviz([]));};
   await h.context.fetchSheetData(true);
   assert.equal(h.state().tickets.length,0);assert.equal(h.state().selectedDateTickets.tickets.length,0);assert.match(h.state().modalNotice,/下架/);
   assert(!requested.includes('表單回應 1'));
 });
 await test('Concurrent refreshes share one network request per source',async()=>{
   const h=harness(undefined,[]);let count=0;h.context.fetch=async()=>{count++;return response(gviz([]));};
   await Promise.all([h.context.fetchSheetData(true),h.context.fetchSheetData(true),h.context.fetchSheetData(true)]);assert.equal(count,3);
 });
 await test('Fresh cache avoids network and stale cache fails safely',async()=>{
   const h=harness(undefined,[{details:simple('樂桃大阪五日')}]);let saved;
   h.context.localStorage.setItem=(key,value)=>saved=value;await h.context.fetchSheetData();
   const fresh=harness();fresh.context.localStorage.getItem=()=>saved;let calls=0;fresh.context.fetch=async()=>{calls++;throw Error('offline');};
   await fresh.context.fetchSheetData();assert.equal(calls,0);assert.equal(fresh.state().tickets.length,1);
   const cached=JSON.parse(saved);for(const source of Object.values(cached.sources))source.syncedAt-=120000;
   const stale=harness();stale.context.localStorage.getItem=()=>JSON.stringify(cached);stale.context.fetch=async()=>{throw Error('offline');};
   await stale.context.fetchSheetData();assert.equal(stale.state().tickets.length,1);assert.equal(stale.context.sourceFresh('flights'),false);
 });
 await test('IDs survive row deletion and price changes; versions change',async()=>{
   const h=harness(undefined,[{details:simple('樂桃大阪五日')},{details:simple('樂桃大阪6日','MM024','MM025',undefined,'10600')}]);await h.context.fetchSheetData();const old=h.state().tickets[0];
   h.context.fetch=async url=>response(gviz(new URL(url).searchParams.get('sheet')==='清艙'?[simple('樂桃大阪五日',undefined,undefined,undefined,'12000')]:[]));
   await h.context.fetchSheetData(true);const latest=h.state().tickets[0];assert.equal(latest.id,old.id);assert.notEqual(latest.version,old.version);
   assert(!h.context.getSearchHTML().includes(encodeURIComponent(latest.details)));
 });
 await test('Malformed cached sheet structures recover through live data',async()=>{
   const h=harness(undefined,[{details:simple('樂桃大阪五日')}]);
   h.context.localStorage.getItem=()=>JSON.stringify({schema:1,sources:{flights:{data:{table:{cols:'invalid',rows:[{c:[null,null,null,null,null,{v:simple('樂桃大阪五日')}]}]}},syncedAt:h.context.Date.now()}}});
   await h.context.fetchSheetData();assert.equal(h.state().tickets.length,1);assert.equal(h.context.sourceFresh('flights'),true);
 });
 await test('Inquiry after a price update uses the current version and details',async()=>{
   const h=harness(undefined,[{details:simple('樂桃大阪五日')}]);await h.context.fetchSheetData();const old=h.state().tickets[0];
   h.state().sources.flights.syncedAt-=120000;
   h.context.fetch=async url=>response(gviz(new URL(url).searchParams.get('sheet')==='清艙'?[simple('樂桃大阪五日',undefined,undefined,undefined,'13000')]:[]));
   await h.context.openOffer(old.id);
   assert.equal(h.state().selectedDateTickets.tickets[0].price,'13000');assert.match(h.state().modalNotice,/更新/);
   const url=decodeURIComponent(h.context.inquiryUrl(h.state().tickets[0]));assert.match(url,/13000/);assert.match(url,/出發地：桃園/);assert.match(url,/MM024/);assert.match(url,/版本：/);
 });
 await test('Offline inquiry is blocked; refreshed CTA tracks product information without personal fields',async()=>{
   const h=harness(undefined,[{details:simple('樂桃大阪五日')}]);await h.context.fetchSheetData();const item=h.state().tickets[0];h.context.showOffer(item.id);
   h.state().sources.flights.syncedAt-=120000;h.context.fetch=async()=>{throw Error('offline');};let prevented=false;
   assert.equal(h.context.prepareInquiry({preventDefault(){prevented=true;}},item.id),false);assert(prevented);await h.context.fetchSheetData();
   assert.equal(h.context.sourceFresh('flights'),false);
   h.state().sources.flights.error=false;h.state().sources.flights.syncedAt=h.context.Date.now();let tracked;
   h.context.trackEvent=(name,params)=>{tracked={name,params};};assert.equal(h.context.prepareInquiry({preventDefault(){}},item.id),true);
   assert.equal(tracked.params.offer_id,item.id);assert.equal(tracked.params.origin,'桃園');assert(!('email' in tracked.params));
 });
 await test('URL restoration preserves filters, month, view and sort; returning home clears search',async()=>{
   const h=harness();await h.context.fetchSheetData();
   h.context.location.search='?country=japan&tab=kansai&month=2027-04&origin=桃園&type=ticket&view=list&sort=date';h.context.restoreURL();h.context.renderMain();
   assert.equal(h.state().selectedTab,'關西');assert.equal(h.state().viewMode,'list');assert.equal(h.state().monthFilter,'2027-04');assert.equal(h.state().origin,'桃園');assert.equal(h.state().listSortBy,'date');
   assert(h.get('main-content').innerHTML.includes('2027-04-11'));assert(!h.get('main-content').innerHTML.includes('2027-01-12'));
   h.context.executeSearch('大阪');assert(h.context.location.search.includes('q='));
   h.context.location.search='';h.context.restoreURL();assert.equal(h.state().searchQuery,'');assert.equal(h.state().selectedCountryObj,null);
   h.context.location.pathname='/destinations/okinawa/';h.context.restoreURL();assert.equal(h.state().selectedTab,'沖繩');
 });
 await test('Background refresh preserves filters and selected calendar month',async()=>{
   const h=harness();await h.context.fetchSheetData();h.context.selectCountry(0);h.context.selectTab('關西');h.context.setFilter('origin','桃園');h.context.setMonth(2027,3);await h.context.fetchSheetData(true);
   assert.equal(h.state().origin,'桃園');assert.equal(h.state().monthFilter,'2027-04');assert.equal(h.state().currentDate.getMonth(),3);
 });
 await test('Price formatting and safe filtering do not modify underlying prices',async()=>{
   const h=harness(undefined,[{details:simple('樂桃大阪五日')}]);await h.context.fetchSheetData();const item=h.state().tickets[0];assert.equal(h.context.formatPrice(item.price),'11,300');assert.equal(item.price,'11300');
   h.context.setFilter('origin','高雄');assert.equal(h.context.matchesFilters(item),false);h.context.clearFilters();assert.equal(h.context.matchesFilters(item),true);
 });
 await test('Static pages have unique metadata, crawlable links, existing layout assets and no runtime Tailwind',()=>{
   const html=fs.readFileSync('index.html','utf8');assert(!html.includes('cdn.tailwindcss.com'));assert(!html.includes('user-scalable=no'));assert(html.includes('href="/destinations/osaka/"'));
   for(const slug of ['osaka','okinawa','seoul']){const page=fs.readFileSync(`destinations/${slug}/index.html`,'utf8');assert(page.includes(`rel="canonical" href="https://www.eddietour.tw/destinations/${slug}/"`));assert(page.includes('票價、航班與機位依旅行社確認'));for(const m of page.matchAll(/(?:src|href)="(\/assets\/[^"?]+)/g))assert(fs.existsSync('.'+m[1]));}
   const app=fs.readFileSync('assets/app.js','utf8');assert(app.includes('Fukusaki_Itinerary'));assert(app.includes('aria-modal="true"'));assert(!app.includes("'contextmenu'"));
 });
 console.log(`RESULT ${passed} optimization checks passed`);
})().catch(e=>{console.error(e);process.exitCode=1;});
