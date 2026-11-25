const assert=require('node:assert/strict');
const {harness,simple}=require('./test-helpers.cjs');
let passed=0;
async function test(name,fn){await fn();console.log('PASS '+name);passed++;}
const fixture=[
 {details:simple('樂桃大阪五日','MM024','MM027','2027/1/12','11300','桃園')},
 {details:simple('樂桃大阪五日','MM024','MM027','2027/4/11','11700','桃園')},
 {details:simple('樂桃高雄大阪五日','MM036','MM035','2027/2/12','12000','高雄')},
 {details:'德威首爾五日\n$9000 出發日：2027/3/12\n去程｜TW666 桃園08:00-仁川11:00\n回程｜TW665 仁川12:00-桃園14:00'}
];
(async()=>{
 await test('Destination facets exclude months belonging to another destination',async()=>{
  const h=harness(undefined,fixture);await h.context.fetchSheetData();h.context.executeSearch('大阪');
  const options=h.context.facetOptions(h.context.scopeTickets(),'monthFilter',h.state());
  assert.deepEqual(Array.from(options,o=>o.value),['2027-01','2027-02','2027-04']);
  h.context.setFilter('origin','桃園');
  assert.deepEqual(Array.from(h.context.facetOptions(h.context.scopeTickets(),'monthFilter',h.state()),o=>o.value),['2027-01','2027-04']);
 });
 await test('Unavailable selected conditions remain visible until the visitor clears them',async()=>{
  const h=harness(undefined,fixture);await h.context.fetchSheetData();h.context.executeSearch('大阪');h.context.setFilter('origin','高雄');h.context.setFilter('monthFilter','2027-04');
  const o=h.context.facetOptions(h.context.scopeTickets(),'monthFilter',h.state()).find(o=>o.value==='2027-04');assert.equal(o.count,0);
  const html=h.get('main-content').innerHTML;assert.match(html,/符合條件：0 個方案/);assert.match(html,/目前沒有符合條件/);assert.match(html,/移除出發月份條件/);
  h.context.clearFilters();assert.match(h.get('main-content').innerHTML,/符合條件：3 個方案/);
 });
 await test('Search month filters apply to the first result as well as later results',async()=>{
  const h=harness(undefined,fixture);await h.context.fetchSheetData();h.context.executeSearch('大阪');h.context.setFilter('monthFilter','2027-04');
  const html=h.context.getSearchHTML();assert.match(html,/2027-04-11/);assert(!html.includes('2027-01-12'));assert(!html.includes('2027-02-12'));
 });
 await test('Quick search commits all conditions and survives a reload through its URL',async()=>{
  const h=harness(undefined,fixture);await h.context.fetchSheetData();let prevented=false;
  const selection={origin:'桃園',destination:'大阪',monthFilter:'2027-04'};
  h.context.submitQuickSearch({preventDefault(){prevented=true;}},{elements:{namedItem:key=>({value:selection[key]})}});
  assert(prevented);assert.match(h.context.location.search,/browse=1/);assert.equal(h.state().viewMode,'list');
  assert.match(h.get('main-content').innerHTML,/符合條件：1 個方案/);
  const reload=harness(undefined,fixture);reload.context.location.search=h.context.location.search;reload.context.restoreURL();await reload.context.fetchSheetData();
  assert.equal(reload.state().destination,'大阪');assert.equal(reload.state().origin,'桃園');assert.match(reload.get('main-content').innerHTML,/2027-04-11/);assert(!reload.get('main-content').innerHTML.includes('2027-01-12'));
 });
 await test('Quick search draft does not change the active view and survives background rendering',async()=>{
  const h=harness(undefined,fixture);await h.context.fetchSheetData();
  const selection={origin:'桃園',destination:'大阪',monthFilter:'2027-04'};
  h.context.updateQuickSearch({elements:{namedItem:key=>({value:selection[key]})}});await h.context.fetchSheetData(true);
  assert.equal(h.state().selectedCountryObj,null);assert.equal(h.state().origin,'');assert.equal(h.state().quickSearch.destination,'大阪');
  assert.match(h.context.getQuickSearchHTML(),/符合條件 1 個方案/);
 });
 await test('Mobile defaults to list while explicit URL and saved view preferences take priority',()=>{
  const h=harness();h.context.matchMedia=()=>({matches:true});h.context.location.pathname='/destinations/osaka/';h.context.restoreURL();assert.equal(h.state().viewMode,'list');
  h.context.location.search='?view=calendar';h.context.restoreURL();assert.equal(h.state().viewMode,'calendar');
  h.context.location.search='';h.context.localStorage.getItem=key=>key==='eddie_ticket_view'?'calendar':null;h.context.restoreURL();assert.equal(h.state().viewMode,'calendar');
 });
 await test('Destination selection refines a region without changing ticket identity or price',async()=>{
  const h=harness(undefined,fixture);await h.context.fetchSheetData();const before=JSON.stringify(h.state().tickets);
  h.context.selectCountry(0);h.context.selectTab('關西');h.context.setFilter('destination','大阪');
  assert.equal(h.context.scopeTickets().length,3);assert.equal(JSON.stringify(h.state().tickets),before);
  h.context.selectTab('關東');assert.equal(h.state().destination,'');
 });
 await test('Calendar result count describes the displayed month, list count describes all matching months',async()=>{
  const h=harness(undefined,fixture);await h.context.fetchSheetData();h.context.selectCountry(0);h.context.selectTab('關西');
  assert.match(h.context.getFiltersHTML(),/2027 年 01 月：1 個方案/);
  h.context.setViewMode('list');assert.match(h.context.getFiltersHTML(),/符合條件：3 個方案/);
 });
 await test('Inquiry text is a request to confirm; single offer has one CTA, calendar choices retain one each',async()=>{
  const h=harness(undefined,fixture);await h.context.fetchSheetData();const first=h.state().tickets[0];h.context.showOffer(first.id);
  const html=h.get('modal-root').innerHTML;assert.match(html,/LINE 確認機位與價格/);assert.equal((html.match(/data-inquiry=/g)||[]).length,1);assert(!html.includes('LINE 搶購'));assert.match(html,/選日期 → 旅行社確認 → 付款開票/);
  h.state().selectedDateTickets.tickets=h.state().tickets.slice(0,2);h.context.renderModal();assert.equal((h.get('modal-root').innerHTML.match(/data-inquiry=/g)||[]).length,2);
 });
 await test('Offline contact contains no stale quote and cannot bypass product refresh checks',async()=>{
  const h=harness(undefined,fixture);await h.context.fetchSheetData();const item=h.state().tickets[0];h.context.showOffer(item.id);h.context.fetch=async()=>{throw Error('offline');};await h.context.fetchSheetData(true);
  const html=h.get('modal-root').innerHTML;assert.match(html,/最新報價尚未核對/);assert.match(html,/LINE 請客服協助查詢/);assert(!html.includes('data-inquiry='));
  const contact=decodeURIComponent(h.context.generalContactHTML());assert(!contact.includes(item.price));assert(!contact.includes(item.date));assert.match(contact,/contact_support/);assert(!contact.includes('click_conversion'));
  let prevented=false;assert.equal(h.context.prepareInquiry({preventDefault(){prevented=true;}},item.id),false);assert(prevented);await h.context.fetchSheetData();
 });
 await test('A recovered source restores the product CTA in an already-open dialog',async()=>{
  const h=harness(undefined,fixture);await h.context.fetchSheetData();const live=h.context.fetch;h.context.showOffer(h.state().tickets[0].id);
  h.context.fetch=async()=>{throw Error('offline');};await h.context.fetchSheetData(true);assert(!h.get('modal-root').innerHTML.includes('data-inquiry='));
  h.context.fetch=live;await h.context.fetchSheetData(true);assert(h.get('modal-root').innerHTML.includes('data-inquiry='));assert(!h.get('modal-root').innerHTML.includes('最新報價尚未核對'));
 });
 await test('No cached data still provides a general contact and reload action',async()=>{
  const h=harness();h.context.fetch=async()=>{throw Error('offline');};await h.context.fetchSheetData();
  assert.match(h.get('main-content').innerHTML,/LINE 請客服協助查詢/);assert.match(h.get('main-content').innerHTML,/重新載入資料/);
 });
 await test('Terms quote source wording without inferring taxes, luggage or a per-person rate',()=>{
  const h=harness();const missing=h.context.offerFactsHTML({date:'2027-04-11',details:'機票'});assert.match(missing,/稅費、行李與計價方式請向旅行社確認/);assert(!missing.includes('每人'));
  const terms=h.context.offerFactsHTML({date:'2027-04-11',details:'未稅，另收稅金\n不含托運行李\n<script>alert(1)</script>手提7公斤'});
  assert.match(terms,/未稅，另收稅金/);assert.match(terms,/不含托運行李/);assert(!terms.includes('<script>'));assert(terms.includes('&lt;script&gt;'));
 });
 await test('Filter values and card titles remain escaped and cannot execute markup',()=>{
  const h=harness();const evil='\"><img src=x onerror=alert(1)>';
  const card=h.context.offerCardHTML({id:'offer-test',date:'2027-01-12',airline:evil,city:evil,price:'11300'});assert(!card.includes('<img'));assert(card.includes('&lt;img'));
  const select=h.context.filterSelect([{origin:evil,date:'2027-01-12'}],'origin','出發地',{});assert(!select.includes('<img'));assert(select.includes('&lt;img'));
 });
 await test('Broad searches show 24 offers initially, reveal more on demand and reset when filters change',async()=>{
  const rows=Array.from({length:30},(_,i)=>({details:simple('樂桃大阪五日','MM024','MM027',`2027/4/${i+1}`)}));
  const h=harness(undefined,rows);await h.context.fetchSheetData();h.context.executeSearch('大阪');
  assert.equal((h.get('main-content').innerHTML.match(/data-offer=/g)||[]).length,24);assert.match(h.get('main-content').innerHTML,/符合條件：30 個方案/);assert.match(h.get('main-content').innerHTML,/再看 6 個方案/);
  h.context.showMoreOffers();assert.equal((h.get('main-content').innerHTML.match(/data-offer=/g)||[]).length,30);
  h.context.setFilter('origin','桃園');assert.equal((h.get('main-content').innerHTML.match(/data-offer=/g)||[]).length,24);
 });
 await test('Searching from the hotel view restores ticket filters and result counts',async()=>{
  const h=harness(undefined,fixture);await h.context.fetchSheetData();h.context.selectCountry(0);h.context.setViewMode('hotels');h.context.executeSearch('大阪');
  assert.equal(h.state().viewMode,'list');assert.match(h.get('main-content').innerHTML,/符合條件：3 個方案/);assert.match(h.get('main-content').innerHTML,/商品篩選/);
 });
 console.log(`RESULT ${passed} experience checks passed`);
})().catch(e=>{console.error(e);process.exitCode=1;});
