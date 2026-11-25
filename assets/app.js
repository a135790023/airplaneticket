
    // --- 📊 GA4 追蹤分析封裝函式 ---
    window.trackEvent = function(eventName, eventParams) {
      try {
        if (typeof gtag === 'function') {
          gtag('event', eventName, eventParams);
        }
      } catch(e) {}
    };

    function toggleFab() {
      const menu = document.getElementById('fab-menu');
      document.querySelector('[aria-controls="fab-menu"]')?.setAttribute('aria-expanded', String(menu.classList.contains('hidden')));
      menu.classList.toggle('hidden');
      menu.classList.toggle('flex');
      if (menu.classList.contains('flex')) {
        window.trackEvent('open_fab_menu', {});
      }
    }


    const state = { 
      tickets: [], tours: [], hotels: [], 
      isLoading: true, loadError: false, selectedCountryObj: null, selectedTab: null, 
      currentDate: new Date(), selectedDateTickets: null, 
      isModalOpen: false, animateTransition: true, 
      viewMode: preferredView(), searchQuery: '', listSortBy: 'price', listLimit: 24,
      origin: '', destination: '', productType: '', monthFilter: '', quickSearch: {origin:'',destination:'',monthFilter:''}, sources: {}, lastSync: 0, modalNotice: '', inquirySource: 'card', pendingOffer: '' 
    };
    window.executeSearch = (q) => { 
        q = q.trim().toLowerCase(); 
        state.searchQuery = q; state.listLimit=24; 
        if (q) { 
            state.selectedCountryObj = { isSearch: true }; 
            state.viewMode = 'list';
            syncURL(); 
            window.trackEvent('search', { search_term: q }); 
        } else { 
            goHome(); 
        } 
        state.animateTransition = true; renderMain(); state.animateTransition = false; 
    };
    
    window.goHome = () => { 
        document.getElementById('searchInput').value = ''; 
        state.searchQuery = ''; 
        state.selectedCountryObj = null; 
        state.selectedTab = null; 
        state.currentDate = new Date(); 
        state.animateTransition = true; 
        state.origin=''; state.destination=''; state.productType=''; state.monthFilter=''; state.quickSearch={origin:'',destination:'',monthFilter:''}; state.viewMode=preferredView(); state.listSortBy='price'; syncURL(); 
        window.trackEvent('navigate_home', {}); 
        renderMain(); 
        state.animateTransition = false; 
        window.scrollTo({ top: 0, behavior: 'smooth' }); 
    };
    
    window.selectCountry = (index) => {
      if (index === 'hotels') { 
        state.selectedCountryObj = { isHotelsGlobal: true }; 
         
        window.trackEvent('select_category', { category: 'Hotels' }); 
      } else { 
        const countryObj = LOCATION_DATA[index]; 
        state.selectedCountryObj = countryObj; state.listLimit=24; 
        state.selectedTab = countryObj.tabs[0].label; 
        state.viewMode = preferredView(); 
         
        window.trackEvent('select_country', { country: countryObj.country }); 
      }
      state.currentDate = new Date(); state.monthFilter=''; state.destination=''; state.searchQuery=''; document.getElementById('searchInput').value=''; syncURL();
      state.animateTransition = true; 
      renderMain(); 
      state.animateTransition = false; 
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    window.selectTab = (tabLabel) => { 
      state.selectedTab = tabLabel; state.listLimit=24; 
      const countryObj = state.selectedCountryObj; 
      const tabObj = countryObj.tabs.find(t => t.label === tabLabel); 
       
      window.trackEvent('select_tab', { tab: tabLabel, country: countryObj.country }); 
      state.currentDate = new Date(); state.monthFilter=''; state.destination=''; state.searchQuery=''; document.getElementById('searchInput').value=''; syncURL();
      state.animateTransition = false; 
      renderMain(); 
    };
    
    window.setViewMode = (mode) => { 
        if(!['calendar','list','hotels'].includes(mode))return;
        state.viewMode = mode; if(mode!=='hotels')try{localStorage.setItem('eddie_ticket_view',mode);}catch(_){} syncURL();
        window.trackEvent('change_view_mode', { mode: mode }); 
        renderMain(); 
    };
    
    window.setListSortBy = (mode) => { state.listSortBy = mode; state.listLimit=24; syncURL(); renderMain(); };
    
    window.setMonth = (y, m) => { 
        state.currentDate = new Date(y, m, 1); state.listLimit=24; state.monthFilter = `${y}-${String(m+1).padStart(2,'0')}`; syncURL(); 
        state.animateTransition = false; 
        renderMain(); 
    };

    window.openModalFromItem = (id) => openOffer(id,'card');
    window.openModal = async (dateStr) => {
      modalTrigger = document.activeElement;
      if(!sourceFresh('flights') || !sourceFresh('tours')) await fetchSheetData();
      const tab = state.selectedCountryObj?.tabs?.find(t=>t.label===state.selectedTab);
      const dayTickets = state.tickets.filter(t => t.country===state.selectedCountryObj?.country && tab?.cities.some(c=>c==='其他航點'||t.city.includes(c)||c.includes(t.city)) && t.date===dateStr && matchesFilters(t));
      state.selectedDateTickets={date:dateStr,tickets:dayTickets}; state.modalNotice=dayTickets.length ? '' : '此日期目前沒有可詢價的商品。';
      state.isModalOpen=true; state.inquirySource='calendar'; renderModal();
    };
    window.closeModal = () => {
      state.isModalOpen=false; state.selectedDateTickets=null; state.modalNotice='';
      const p=new URLSearchParams(location.search); if(p.has('offer')) {p.delete('offer'); safeUpdateURL('/'+(p.size?'?'+p:''),true);}
      renderModal();
      const target=modalTrigger?.isConnected ? modalTrigger : document.querySelector('[data-offer="'+(modalTrigger?.getAttribute?.('data-offer')||'')+'"]') || document.getElementById('main-content');
      target?.focus?.({preventScroll:true});
    };

    // Stable IDs exclude row positions and prices when flight/product identity is known.
    function stableHash(value) {
      let a=0x811c9dc5,b=0x9e3779b9;
      for(const c of String(value)) { a=Math.imul(a^c.charCodeAt(0),16777619); b=Math.imul(b^c.charCodeAt(0),2246822519); }
      return (a>>>0).toString(36)+(b>>>0).toString(36);
    }
    function travelFacts(item,row={}) {
      const text=item.blockText || '';
      const out=text.split('\n').find(l=>/去程|往程/.test(l)) || '';
      const back=text.split('\n').find(l=>/回程|返程/.test(l)) || '';
      const codes=line=>[...line.toUpperCase().matchAll(/\b([A-Z][A-Z0-9]|[0-9][A-Z])\s*(\d{2,4})\b/g)].map(m=>m[1]+m[2]).join(' / ');
      const origin=String(row.origin || out.match(/桃園|高雄|台中|臺中|松山|台南|臺南|台北|臺北/)?.[0] || item.titleContext?.match(/桃園|高雄|台中|臺中|松山|台南|臺南|台北|臺北/)?.[0] || '').replace(/臺/g,'台');
      const duration=normalizeDays(item.titleContext).match(/\d+(?:\s*[+＋]\s*\d+)?\s*(?:日|天)/)?.[0] || '';
      const rawReturn=String(row.returnDate || '').replaceAll('/','-');
      const returnDate=/^\d{4}-\d{2}-\d{2}$/.test(rawReturn)&&validISODate(...rawReturn.split('-').map(Number)) ? rawReturn : back.match(/20\d{2}[/-]\d{1,2}[/-]\d{1,2}/)?.[0];
      return {origin,duration,outboundFlight:codes(out),inboundFlight:codes(back),outboundInfo:out,inboundInfo:back,returnDate:returnDate || ''};
    }
    function formatPrice(value) { return /^\d[\d,]*$/.test(String(value)) ? Number(String(value).replaceAll(',','')).toLocaleString('en-US') : escapeHTML(value); }
    function quoteLabel(item) {
      const unit = item.priceUnit === 'pair' ? '兩人合計' : item.priceUnit === 'person' ? '每人' : '';
      return (state.sources[item.source]?.error ? '上次讀取報價' : '參考報價') + (unit ? ' · ' + unit : '');
    }
    function compactPriceUnit(item) { return item.priceUnit === 'pair' ? '兩人合計' : ''; }

    function travelSummary(item) {
      const departure=[item.origin,item.duration].filter(Boolean).join('｜');
      const flight=(label,value)=>value ? label+'｜'+value.replace(/^(?:去程|往程|回程|返程)\s*[｜|:：]?\s*/, '').trim() : '';
      return [departure&&'出發｜'+departure,flight('去程',item.outboundInfo),flight('回程',item.inboundInfo),item.returnDate&&'回程日期｜'+item.returnDate].filter(Boolean).join('\n') || '航班及回程日期請參考廠商原文或詢問客服。';
    }
    function preferredView() {
      try { const saved=localStorage.getItem('eddie_ticket_view');if(['calendar','list'].includes(saved))return saved; } catch(_) {}
      return window.matchMedia?.('(max-width: 639px)').matches ? 'list' : 'calendar';
    }
    const TYPE_OPTIONS=[['ticket','純機票'],['package','機加酒'],['tour','旅行團']];
    function filterValue(item,key) {
      if(key==='productType')return item.isTour?'tour':item.isFlightAndHotel?'package':'ticket';
      if(key==='destination')return item.city || '';
      if(key==='monthFilter')return item.date.slice(0,7);
      return item.origin || '';
    }
    function matchesSelection(item,selection,except='') {
      return ['origin','destination','productType','monthFilter'].every(key=>key===except||!selection[key]||filterValue(item,key)===selection[key]);
    }
    function matchesFilters(item,includeMonth=true) { return matchesSelection(item,state,includeMonth?'':'monthFilter'); }
    function scopeTickets() {
      const q=state.searchQuery;
      if(q)return state.tickets.filter(t=>[t.country,t.city,t.airline,t.details].some(value=>String(value||'').toLowerCase().includes(q)));
      const country=state.selectedCountryObj, tab=country?.tabs?.find(t=>t.label===state.selectedTab);
      if(country?.tabs)return state.tickets.filter(t=>t.country===country.country && (!tab||tab.cities.some(c=>c==='其他航點'||t.city.includes(c)||c.includes(t.city))));
      return state.tickets;
    }
    function facetOptions(tickets,key,selection) {
      const counts=new Map();
      for(const item of tickets)if(matchesSelection(item,selection,key)) { const value=filterValue(item,key);if(value)counts.set(value,(counts.get(value)||0)+1); }
      if(selection[key]&&!counts.has(selection[key]))counts.set(selection[key],0);
      return [...counts].sort(([a],[b])=>a.localeCompare(b,'zh-TW')).map(([value,count])=>({value,count,label:key==='monthFilter'?value.replace('-','/'):key==='productType'?(TYPE_OPTIONS.find(x=>x[0]===value)?.[1]||value):value}));
    }
    function filterSelect(tickets,key,label,selection,quick=false) {
      const available=facetOptions(tickets,key,selection);
      const options=quick?facetOptions(tickets,key,{}).map(o=>({...o,count:available.find(a=>a.value===o.value)?.count||0})):available;
      return `<label class="block text-xs text-gray-500 font-bold min-w-0">${label}<select aria-label="${label}" name="${key}" data-filter="${key}" onchange="${quick?'updateQuickSearch(this.form)':`setFilter('${key}',this.value)`}" class="block mt-1 w-full min-h-[44px] bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800"><option value="">${key==='monthFilter'?'不限月份':'不限'}</option>${options.map(o=>`<option value="${escapeHTML(o.value)}" ${o.value===selection[key]?'selected':''} ${o.count===0?'disabled':''}>${escapeHTML(o.label)}（${o.count}）</option>`).join('')}</select></label>`;
    }
    function getFiltersHTML() {
      const labels={origin:'出發地',destination:'目的地',monthFilter:'出發月份',productType:'商品類型'};
      const selected=Object.entries(labels).filter(([key])=>state[key]);
      if (!selected.length) return '';
      return `<section aria-label="已選條件" class="flex flex-wrap items-center gap-2 mb-5">${selected.map(([key,label])=>`<button onclick="setFilter('${key}','')" class="min-h-[36px] bg-blue-50 text-blue-800 rounded-lg px-3 py-1 text-xs" aria-label="移除${label}條件">${label}：${escapeHTML(key==='productType'?(TYPE_OPTIONS.find(x=>x[0]===state[key])?.[1]||state[key]):state[key])} ×</button>`).join('')}<button onclick="clearFilters()" class="min-h-[44px] text-sm text-blue-600 underline px-2">清除篩選</button></section>`;
    }

    window.setFilter=(key,value)=>{
      if(!['origin','destination','productType','monthFilter'].includes(key))return;
      state[key]=value; state.listLimit=24;
      if(key==='monthFilter'&&value){const[y,m]=value.split('-');state.currentDate=new Date(+y,+m-1,1);}
      syncURL();renderMain();document.querySelector(`[data-filter="${key}"]`)?.focus();
    };
    window.clearFilters=()=>{state.listLimit=24;state.origin='';state.destination='';state.productType='';state.monthFilter='';syncURL();renderMain();};
    function getQuickSearchHTML() {
      const selection=state.quickSearch,count=state.tickets.filter(t=>matchesSelection(t,selection)).length;
      return `<section id="quick-search" aria-label="快速查票" class="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 mb-8 shadow-sm"><h2 class="font-black text-lg text-gray-900 mb-3">先找適合你的出發日期</h2><form onsubmit="submitQuickSearch(event,this)"><div class="grid grid-cols-2 sm:grid-cols-3 gap-3">${[['origin','出發地'],['destination','目的地'],['monthFilter','出發月份']].map(([key,label])=>filterSelect(state.tickets,key,label,selection,true)).join('')}</div><div class="flex flex-wrap gap-3 items-center justify-between mt-4"><p role="status" class="text-xs text-gray-500">${count?'符合條件 '+count+' 個方案':'可選不限條件，查看其他出發日期'}</p><button type="submit" class="w-full sm:w-auto min-h-[44px] bg-gray-900 hover:bg-blue-600 text-white font-bold rounded-xl px-6 py-3">查看機票與行程</button></div></form></section>`;
    }
    function quickSelection(form) { return Object.fromEntries(['origin','destination','monthFilter'].map(key=>[key,form.elements.namedItem(key).value])); }
    window.updateQuickSearch=form=>{
      state.quickSearch=quickSelection(form);
      // Keep native selects mounted while the browser finishes closing its picker.
      // Replacing the form and focusing a new select can reopen the mobile picker.
      for(const key of ['origin','destination','monthFilter']) {
        const select=form.elements.namedItem(key);
        if(!select.options)continue;
        const available=new Map(facetOptions(state.tickets,key,state.quickSearch).map(o=>[o.value,o]));
        for(const option of select.options) {
          if(!option.value)continue;
          const choice=available.get(option.value);
          option.disabled=!choice?.count;
          const label=choice?.label || (key==='monthFilter'?option.value.replace('-','/'):option.value);
          option.textContent=`${label}（${choice?.count || 0}）`;
        }
      }
      const count=state.tickets.filter(t=>matchesSelection(t,state.quickSearch)).length;
      const status=form.querySelector?.('[role="status"]');
      if(status)status.textContent=count?'符合條件 '+count+' 個方案':'可選不限條件，查看其他出發日期';
    };
    window.submitQuickSearch=(event,form)=>{
      event.preventDefault();state.listLimit=24;state.quickSearch=quickSelection(form);Object.assign(state,state.quickSearch);
      state.searchQuery='';state.productType='';state.selectedCountryObj={isSearch:true};state.selectedTab=null;state.viewMode='list';
      document.getElementById('searchInput').value='';syncURL();renderMain();
      window.trackEvent('quick_search',{origin:state.origin,destination:state.destination,month:state.monthFilter});
      document.getElementById('main-content')?.focus?.({preventScroll:true});window.scrollTo({top:0,behavior:'smooth'});
    };
    function offerCardHTML(t) {
      const type=t.isTour?'旅行團':t.isFlightAndHotel?'機加酒':'純機票';
      const flights=[t.outboundFlight,t.inboundFlight].filter(Boolean).join('／');
      return `<button type="button" data-offer="${escapeHTML(t.id)}" onclick="openModalFromItem('${t.id}')" class="w-full text-left bg-white border border-gray-100 rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-md flex flex-col gap-3 ${t.isWarning?'ring-1 ring-red-400':''}"><div class="text-xs font-bold text-gray-500">${escapeHTML(t.date)} 出發${t.duration?' · '+escapeHTML(t.duration):''}</div><h3 class="font-black text-gray-900 text-base sm:text-lg leading-snug break-words">${escapeHTML(t.airline)}</h3><div class="flex flex-wrap gap-2 text-xs text-gray-600"><span class="rounded-md bg-gray-50 px-2 py-1">${escapeHTML(t.origin?t.origin+' → '+t.city:t.city)} · ${type}</span>${t.airlineTag?`<span class="rounded-md bg-blue-50 text-blue-700 px-2 py-1">${escapeHTML(t.airlineTag)}</span>`:''}${t.isWarning?'<span class="text-red-700 bg-red-50 rounded-md px-2 py-1">機位需確認</span>':''}</div>${flights?`<p class="text-xs text-gray-500">航班 ${escapeHTML(flights)}</p>`:''}<div class="flex justify-between items-end gap-3 border-t border-gray-100 pt-3 mt-auto"><div><p class="text-xs text-gray-500">${quoteLabel(t)}</p><p class="text-xl font-black text-red-500">$${formatPrice(t.price||'--')}</p></div><span class="text-sm font-bold text-blue-600">查看詳情與詢價 →</span></div></button>`;
    }
    function moreResultsHTML(total) {
      return total>state.listLimit?`<div class="text-center mt-6"><p class="text-sm text-gray-500 mb-3">已顯示 ${state.listLimit}／${total} 個方案</p><button onclick="showMoreOffers()" class="min-h-[44px] bg-white border border-gray-300 text-gray-800 rounded-xl px-6 py-3 font-bold text-sm">再看 ${Math.min(24,total-state.listLimit)} 個方案</button></div>`:'';
    }
    window.showMoreOffers=()=>{const previous=state.listLimit;state.listLimit+=24;renderMain();document.querySelectorAll('#main-content [data-offer]')[previous]?.focus({preventScroll:true});};
    function emptyResultsHTML() {
      return `<div class="py-12 px-5 text-center text-gray-500 bg-white rounded-2xl border border-gray-100"><h2 class="font-bold text-gray-800 mb-2">目前沒有符合條件的方案</h2><p class="text-sm mb-4">試試其他月份、出發地，或清除篩選查看更多選擇。</p><button onclick="clearFilters()" class="min-h-[44px] bg-gray-900 text-white rounded-xl px-4 py-2 text-sm font-bold">清除篩選</button><button onclick="goHome()" class="min-h-[44px] text-blue-600 px-4 py-2 text-sm font-bold">重新查票</button></div>`;
    }
    function generalContactHTML() {
      const url=`https://line.me/R/oaMessage/${LINE_OFFICIAL_ID}/?`+encodeURIComponent('您好，我從 eddietour.tw 前來，目前網站無法核對最新資料，想請您協助查詢機位與價格。');
      return `<a href="${escapeHTML(url)}" target="_blank" rel="noreferrer" onclick="trackEvent('contact_support',{source:'sync_error'})" class="min-h-[44px] inline-flex items-center justify-center px-4 py-3 rounded-xl bg-[#06C755] text-white font-bold text-sm">LINE 請客服協助查詢</a>`;
    }
    function inquiryButtonHTML(item) {
      return `<a href="${escapeHTML(inquiryUrl(item))}" target="_blank" rel="noreferrer" data-inquiry="${escapeHTML(item.id)}" onclick="return prepareInquiry(event,'${item.id}')" class="w-full min-h-[44px] bg-[#06C755] hover:bg-[#05b34c] text-white font-bold py-3 px-3 rounded-xl flex items-center justify-center gap-2 text-sm"><i class="ph-bold ph-chat-circle-dots text-xl"></i>LINE 確認${item.isTour?'名額':'機位'}與價格</a>`;
    }
    function offerFactsHTML(item) {
      const terms=[...new Set((item.details||'').split('\n').map(l=>l.trim()).filter(l=>/含稅|未稅|不含稅|行李|托運|手提|無餐|含餐/.test(l)&&!/(?:出發日|https?:\/\/)/.test(l)))];
      return `<p class="text-xs text-gray-500 mb-2">出發日期｜${escapeHTML(item.date)}</p><p class="text-sm text-gray-800 whitespace-pre-line leading-7 break-words">${escapeHTML(travelSummary(item))}</p><div class="border-t border-gray-200 mt-3 pt-3"><p class="text-xs font-bold text-gray-500 mb-1">費用與行李${terms.length?'（廠商原文）':''}</p><p class="text-sm whitespace-pre-line break-words">${escapeHTML(terms.join('\n')||'稅費、行李與計價方式請向旅行社確認。')}</p></div>`;
    }
    function safeUpdateURL(url,replace=false) {
      try { if(url !== location.pathname+location.search) history[replace?'replaceState':'pushState']({},'',url); } catch(_) {}
    }
    function viewParams() {
      const p=new URLSearchParams();
      if(state.searchQuery)p.set('q',state.searchQuery);
      else if(state.selectedCountryObj?.isSearch)p.set('browse','1');
      else if(state.selectedCountryObj?.isHotelsGlobal)p.set('hotels','true');
      else if(state.selectedCountryObj?.slug){p.set('country',state.selectedCountryObj.slug);const tab=state.selectedCountryObj.tabs.find(t=>t.label===state.selectedTab);if(tab)p.set('tab',tab.slug);}
      if(state.selectedCountryObj?.tabs||state.viewMode!=='calendar')p.set('view',state.viewMode);
      if(state.listSortBy!=='price')p.set('sort',state.listSortBy);
      if(state.origin)p.set('origin',state.origin);
      if(state.destination)p.set('city',state.destination);
      if(state.productType)p.set('type',state.productType);
      if(state.monthFilter)p.set('month',state.monthFilter);
      return p;
    }
    function syncURL(replace=false) { const p=viewParams();safeUpdateURL('/'+(p.size?'?'+p:''),replace);updateMetadata(); }
    const DESTINATION_ROUTES = {
      '/destinations/osaka/':{country:'japan',tab:'kansai',name:'大阪'},
      '/destinations/okinawa/':{country:'japan',tab:'okinawa',name:'沖繩'},
      '/destinations/seoul/':{country:'korea',tab:'seoul',name:'首爾'}
    };
    function restoreURL() {
      const p=new URLSearchParams(location.search), route=DESTINATION_ROUTES[location.pathname];
      state.listLimit=24;state.searchQuery=p.get('q') || '';state.selectedCountryObj=null;state.selectedTab=null;
      state.viewMode=['calendar','list','hotels'].includes(p.get('view'))?p.get('view'):preferredView();
      state.listSortBy=p.get('sort')==='date'?'date':'price';
      state.origin=p.get('origin')||'';state.destination=p.get('city')||'';state.productType=['ticket','package','tour'].includes(p.get('type'))?p.get('type'):'';
      state.monthFilter=/^20\d{2}-(0[1-9]|1[0-2])$/.test(p.get('month'))?p.get('month'):'';
      const date=state.monthFilter || taipeiToday().slice(0,7);state.currentDate=new Date(+date.slice(0,4),+date.slice(5)-1,1);
      if(state.searchQuery||p.get('browse')==='1'){state.selectedCountryObj={isSearch:true};state.viewMode='list';}
      else if(p.get('hotels')==='true')state.selectedCountryObj={isHotelsGlobal:true};
      else {const country=LOCATION_DATA.find(x=>x.slug===(p.get('country')||route?.country));if(country){state.selectedCountryObj=country;state.selectedTab=country.tabs.find(t=>t.slug===(p.get('tab')||route?.tab))?.label || country.tabs[0].label;}}
      document.getElementById('searchInput').value=state.searchQuery;
      state.isModalOpen=false;state.selectedDateTickets=null;state.modalNotice='';state.pendingOffer=p.get('offer')||'';
      updateMetadata();
    }
    function updateMetadata() {
      const base='艾迪王旅遊秘笈', p=viewParams();
      let title=base+'｜清艙機票．團旅．出國必備', description='探索最新清艙機票、團體行程與社群推薦住宿。依出發地、月份與商品類型篩選，實際機位與票價請向旅行社確認。';
      const country=state.selectedCountryObj;
      if(state.searchQuery)title=state.searchQuery+' 搜尋結果｜'+base;
      else if(country?.isHotelsGlobal)title='飯店推薦與住宿心得｜'+base;
      else if(country?.tabs){const tab=country.tabs.find(t=>t.label===state.selectedTab);const places=tab?.cities.slice(0,2).join('、')||country.country;title=places+'清艙機票與旅行團｜'+base;description=`查看${places}出發日期與參考票價，依出發地、月份及機票／機加酒／旅行團篩選。實際機位與票價依旅行社確認。`;}
      let canonical='https://www.eddietour.tw/';
      const match=Object.entries(DESTINATION_ROUTES).find(([,r])=>r.country===country?.slug && country.tabs.find(t=>t.label===state.selectedTab)?.slug===r.tab);
      if(match&&!state.searchQuery)canonical='https://www.eddietour.tw'+match[0];
      else if(country?.slug){const clean=new URLSearchParams();clean.set('country',country.slug);if(p.has('tab'))clean.set('tab',p.get('tab'));canonical+='?'+clean;}
      else if(country?.isHotelsGlobal)canonical+='?hotels=true';
      document.title=title;
      for(const selector of ['meta[name="description"]','meta[property="og:description"]','meta[name="twitter:description"]'])document.querySelector(selector)?.setAttribute('content',description);
      for(const selector of ['meta[property="og:title"]','meta[name="twitter:title"]'])document.querySelector(selector)?.setAttribute('content',title);
      document.querySelector('link[rel="canonical"]')?.setAttribute('href',canonical);
      document.querySelector('meta[property="og:url"]')?.setAttribute('content',canonical);
    }
    let modalTrigger=null, modalSyncState='';
    function modalSourceState() { return JSON.stringify((state.selectedDateTickets?.tickets||[]).map(t=>!!state.sources[t.source]?.error)); }
    function shareUrl(id) { return 'https://www.eddietour.tw/?offer='+encodeURIComponent(id); }
    window.copyOfferLink=async(button,id)=>{
      const area=button.closest('[data-share]');
      const status=area.querySelector('[role="status"]');
      const field=area.querySelector('input');
      field.value=shareUrl(id);field.hidden=false;
      button.disabled=true;status.textContent='正在複製連結…';
      try {
        if(!window.navigator?.clipboard?.writeText)throw new Error('Clipboard unavailable');
        await window.navigator.clipboard.writeText(field.value);
        status.textContent='已複製商品連結，可貼給親友。';
      } catch {
        status.textContent='無法自動複製，請長按或選取下方網址複製。';
        field.focus();field.select();
      } finally { button.disabled=false; }
    };
    function showOffer(id,source='card',push=true) {
      const item=state.tickets.find(t=>t.id===id);
      state.selectedDateTickets={date:item?.date || '商品狀態',tickets:item?[item]:[]};
      state.modalNotice=item ? '' : '這筆商品已下架、超過開票門檻，或目前無法取得。請重新搜尋最新方案。';
      state.isModalOpen=true;state.inquirySource=source;
      if(push){const p=viewParams();p.set('offer',id);safeUpdateURL('/?'+p);}
      window.trackEvent('view_ticket_details',{offer_id:id,source});renderModal();
    }
    async function openOffer(id,source='card',push=true) {
      modalTrigger=document.activeElement;
      const previous=state.tickets.find(t=>t.id===id);
      if(!previous || !sourceFresh(previous.source))await fetchSheetData();
      showOffer(id,source,push);
      const current=state.tickets.find(t=>t.id===id);
      if(previous && current?.version!==previous.version){state.modalNotice='商品資訊已更新，請確認下方最新價格與內容。';renderModal();}
    }
    function reconcileModal() {
      if(!state.isModalOpen||!state.selectedDateTickets)return;
      const old=state.selectedDateTickets.tickets;
      const latest=old.map(t=>state.tickets.find(n=>n.id===t.id)).filter(Boolean);
      if(latest.length!==old.length||latest.some((t,i)=>t.version!==old[i]?.version)) {
        state.modalNotice='商品資訊已更新或部分商品已下架，請確認最新內容。';
        state.selectedDateTickets.tickets=latest;renderModal();
      } else if(modalSyncState!==modalSourceState())renderModal();
    }
    function inquiryUrl(item) {
      const title=item.isTour?'跟團行程訂購公版':'清艙機票訂購公版';
      const fields=[title,'備註：eddie推薦(不可刪)',(item.isTour?'行程名稱：':'航空航點：')+item.airline+' '+item.country+item.city,'日期：'+item.date,'金額：$'+item.price+(item.priceUnit==='pair'?'（兩人合計）':item.priceUnit==='person'?'（每人）':''),
        item.origin&&'出發地：'+item.origin,item.duration&&'天數：'+item.duration,item.outboundFlight&&'去程航班：'+item.outboundFlight,item.inboundFlight&&'回程航班：'+item.inboundFlight,item.returnDate&&'回程日期：'+item.returnDate,
        '姓名：',(item.isTour?'報名人數':'張數')+'：','聯絡電話：','聯絡信箱：'];
      return `https://line.me/R/oaMessage/${LINE_OFFICIAL_ID}/?`+encodeURIComponent(fields.filter(Boolean).join('\n'));
    }
    function prepareInquiry(event,id) {
      const item=state.tickets.find(t=>t.id===id);
      // Follow the rendered LINE link immediately; background sync must not
      // interrupt the visitor's click or require a second confirmation.
      if(!item)return true;
      window.trackEvent('click_conversion',{target:'LINE_Booking',type:item.isTour?'Tour':'Ticket',offer_id:item.id,origin:item.origin,destination:item.city,departure_date:item.date,value:Number(item.price)||0,currency:'TWD',source:state.inquirySource});
      return true;
    }
    function setModalBackground(open) {
      for(const el of document.querySelectorAll('nav,main,footer,body > div.fixed'))el.inert=open;
      document.body.style.overflow=open?'hidden':'';
    }
    function enhanceAccessibility(root) {
      for(const el of root.querySelectorAll('[onclick]'))if(!el.matches('a,button,input,select,summary')){el.setAttribute('role','button');el.setAttribute('tabindex','0');}
      for(const img of root.querySelectorAll('img')){img.decoding='async';}
    }
    document.addEventListener('keydown',event=>{
      if(state.isModalOpen){
        if(event.key==='Escape'){event.preventDefault();closeModal();return;}
        if(event.key==='Tab'){
          const dialog=document.querySelector('[role="dialog"]');
          const list=[...(dialog?.querySelectorAll('button,a[href],summary,input,select,[tabindex="0"]')||[])].filter(el=>el.getClientRects().length&&!el.disabled);
          const first=list[0],last=list.at(-1);
          if(!first){event.preventDefault();dialog?.focus();}
          else if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog)){event.preventDefault();last.focus();}
          else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===dialog)){event.preventDefault();first.focus();}
        }
      }
      if(['Enter',' '].includes(event.key)&&event.target.matches('[role="button"][onclick]')&&!event.target.matches('button,a')){event.preventDefault();event.target.click();}
    });

    function getLoadingHTML() { 
      return `
        <div class="animate-pulse fade-in text-center py-32">
          <i class="ph-bold ph-airplane-tilt text-5xl text-gray-300 mb-4 animate-bounce inline-block"></i>
          <p class="text-gray-600 font-bold mb-1">正在從試算表同步資料...</p>
          <p class="text-xs text-gray-400 font-medium">正在取得最新日期與參考報價，請稍候</p>
        </div>`; 
    }

    function getSearchHTML() {
      const q = state.searchQuery;
      // 過濾搜尋結果
      const matchedTickets = scopeTickets();

      let allMatches = matchedTickets.filter(t => matchesFilters(t));
      
      // 依據 state.listSortBy 進行排序（金額或出發日期）
      if (state.listSortBy === 'date') {
        allMatches.sort((a,b) => {
          if (a.date !== b.date) return a.date.localeCompare(b.date);
          return (parseInt((a.price||'').replace(/\D/g, '')) || 999999) - (parseInt((b.price||'').replace(/\D/g, '')) || 999999);
        });
      } else {
        allMatches.sort((a,b) => (parseInt((a.price||'').replace(/\D/g, '')) || 999999) - (parseInt((b.price||'').replace(/\D/g, '')) || 999999));
      }

      // 共用的排序 UI 介面
      const sortUI = allMatches.length > 0 ? `
        <div class="flex items-center justify-end gap-2 fade-in">
          <span class="text-sm font-bold text-gray-500">排序：</span>
          <div class="bg-gray-100 p-1 rounded-lg flex text-xs font-bold">
            <button onclick="setListSortBy('price')" class="px-3 py-1.5 rounded-md transition-all ${state.listSortBy !== 'date' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}">最低金額</button>
            <button onclick="setListSortBy('date')" class="px-3 py-1.5 rounded-md transition-all ${state.listSortBy === 'date' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}">出發日期</button>
          </div>
        </div>
      ` : '';

      const listHTML = allMatches.slice(0,state.listLimit).map(offerCardHTML).join('');

      return `
        <div class="fade-in">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div class="flex items-center gap-4">
              <button aria-label="返回首頁" onclick="goHome()" class="p-2.5 bg-white border border-gray-200 rounded-full flex items-center justify-center">
                <i class="ph-bold ph-arrow-left text-xl"></i>
              </button>
              <h1 class="text-xl sm:text-2xl font-bold">${state.searchQuery?'搜尋結果：'+escapeHTML(state.searchQuery):'符合條件的機票與行程'}</h1>
            </div>
            ${sortUI}
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            ${listHTML || emptyResultsHTML()}
          </div>${moreResultsHTML(allMatches.length)}
        </div>
      `;
    }

    function getGlobalHotelsHTML() {
      if (state.hotels.length === 0) {
        return `
          <div class="fade-in slide-in-from-right-8">
            <div class="flex flex-wrap items-center justify-between gap-4 mb-8">
              <div class="flex items-center gap-4">
                <button aria-label="返回首頁" onclick="goHome()" class="p-2.5 bg-white border border-gray-200 rounded-full text-gray-600 hover:bg-gray-50 transition-colors shadow-sm flex items-center justify-center"><i class="ph-bold ph-arrow-left text-xl"></i></button>
                <div><h1 class="text-2xl font-bold text-gray-900">網友分享住宿總覽</h1></div>
              </div>
              <a href="https://forms.gle/w9A4onjw4dmcLdDD8" target="_blank" onclick="window.trackEvent('click_outbound', {target: 'Submit_Hotel_Form'})" class="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-sm flex items-center gap-2 transition-all hover:scale-105"><i class="ph-bold ph-pencil-simple text-lg"></i> 分享住宿</a>
            </div>
            <div class="py-24 text-center text-gray-500 bg-white rounded-3xl border border-gray-100 shadow-sm"><i class="ph-bold ph-buildings text-5xl text-gray-300 mb-4"></i><p class="font-bold text-gray-700 text-lg mb-2">目前還沒有飯店推薦</p><p class="text-sm">歡迎分享住宿經驗，審核後會顯示在這裡。</p></div>
          </div>`;
      }

      const listHTML = state.hotels.map(h => {
        const searchUrl = safeHttpUrl(h.link) || `https://www.google.com/search?q=${encodeURIComponent((h.country==='其他'?'':h.country) + ' ' + h.city + ' ' + h.name + ' 飯店')}`;
        const submitterHtml = h.submitter ? `<div class="mt-4 flex items-center justify-end gap-1.5 text-[11px] font-bold text-gray-400"><i class="ph-fill ph-user-circle text-[14px]"></i> @${escapeHTML(h.submitter)} 熱心分享</div>` : '';

        return `
          <div class="bg-white border border-gray-100 rounded-2xl p-5 sm:p-6 shadow-sm hover:shadow-lg transition-all flex flex-col justify-between h-full group">
            <div>
              <div class="flex items-start justify-between mb-3">
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-600 text-xs font-bold rounded-md">
                  <i class="ph-bold ph-map-pin"></i> ${escapeHTML(h.country)} · ${escapeHTML(h.city)}
                </span>
              </div>
              <h3 class="text-xl font-black text-gray-900 mb-3 leading-snug group-hover:text-blue-600 transition-colors">${escapeHTML(h.name)}</h3>
              <div class="bg-gray-50 p-4 rounded-xl text-sm text-gray-600 whitespace-pre-wrap leading-relaxed border border-gray-100 relative">
                <i class="ph-fill ph-quotes text-gray-200 text-2xl absolute -top-2 -left-1"></i>
                <div class="relative z-10 selectable-text pr-2">${escapeHTML(h.description)}</div>
              </div>
              ${submitterHtml}
            </div>
            <a href="${escapeHTML(searchUrl)}" target="_blank" rel="noreferrer" onclick="window.trackEvent('click_outbound', ${eventParams({target: 'Hotel_Search', hotel_name: h.name})})" class="mt-5 w-full bg-gray-900 hover:bg-blue-600 text-white font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm">
              <i class="ph-bold ph-magnifying-glass text-lg"></i> 前往搜尋查看
            </a>
          </div>
        `;
      }).join('');

      return `
        <div class="fade-in slide-in-from-right-8">
          <div class="flex flex-wrap items-center justify-between gap-4 mb-8">
            <div class="flex items-center gap-4">
              <button aria-label="返回首頁" onclick="goHome()" class="p-2.5 bg-white border border-gray-200 rounded-full text-gray-600 hover:bg-gray-50 transition-colors shadow-sm flex items-center justify-center"><i class="ph-bold ph-arrow-left text-xl"></i></button>
              <div>
                <h1 class="text-2xl font-bold text-gray-900">網友分享住宿總覽</h1>
                <p class="text-sm text-gray-500 mt-1">網友真實評鑑，高 CP 值住宿不踩雷！</p>
              </div>
            </div>
            <a href="https://forms.gle/w9A4onjw4dmcLdDD8" target="_blank" onclick="window.trackEvent('click_outbound', {target: 'Submit_Hotel_Form'})" class="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-sm flex items-center gap-2 transition-all hover:scale-105"><i class="ph-bold ph-pencil-simple text-lg"></i> 分享住宿</a>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">${listHTML}</div>
        </div>`;
    }

    function getHomeHTML() {
      let cardsHTML = LOCATION_DATA.map((loc, index) => `
        <a href="/?country=${loc.slug}&tab=${loc.tabs[0].slug}" onclick="if(!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey){event.preventDefault();selectCountry(${index})}" class="group relative h-64 lg:h-80 rounded-3xl overflow-hidden cursor-pointer shadow-md hover:shadow-2xl hover:-translate-y-1.5 transition-all duration-300">
          <img src="${loc.image}" width="800" height="600" loading="${index < 2 ? 'eager' : 'lazy'}" decoding="async" alt="${loc.country}" class="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"/>
          <div class="absolute inset-0 bg-gradient-to-t from-gray-900/80 via-gray-900/20 to-transparent transition-opacity group-hover:opacity-90"></div>
          <div class="absolute bottom-0 left-0 p-4 sm:p-5">
            <h3 class="text-lg sm:text-xl font-bold text-white mb-1 flex items-center gap-2"><i class="ph-bold ph-map-pin text-white/80"></i> ${loc.country}</h3>
            <p class="text-white/70 text-[10px] sm:text-xs font-medium">包含 ${loc.tabs.reduce((sum, tab) => sum + tab.cities.length, 0)} 航點</p>
          </div>
        </a>`).join('');
      
      const hotelCardHTML = `
        <a href="/?hotels=true" onclick="if(!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey){event.preventDefault();selectCountry('hotels')}" class="group relative h-64 lg:h-80 rounded-3xl overflow-hidden cursor-pointer shadow-md hover:shadow-2xl hover:-translate-y-1.5 transition-all duration-300 ring-2 ring-transparent hover:ring-blue-500/50">
          <img src="https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80" alt="飯店總覽" loading="lazy" decoding="async" width="800" height="600" class="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"/>
          <div class="absolute inset-0 bg-gradient-to-t from-gray-900/90 via-gray-900/30 to-transparent transition-opacity group-hover:opacity-90"></div>
          <div class="absolute bottom-0 left-0 p-4 sm:p-5 w-full">
            <div class="flex items-center gap-1.5 mb-1">
              <i class="ph-bold ph-buildings text-xl text-white drop-shadow-md"></i>
              <h3 class="text-lg sm:text-xl font-bold text-white tracking-tight drop-shadow-md">飯店總覽</h3>
            </div>
            <p class="text-white/80 text-[10px] sm:text-xs font-medium drop-shadow-md">網友真實評鑑住宿</p>
          </div>
        </a>
      `;
      cardsHTML += hotelCardHTML;

      const bannersHTML = `
        <div class="mt-16 w-full space-y-6">
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-2xl font-black text-gray-900 pl-3 border-l-4 border-gray-900 tracking-tight">旅遊必備推薦</h2>
            ${state.isLoading ? '<div class="flex items-center gap-2 text-xs font-bold text-gray-400 bg-gray-100 px-3 py-1.5 rounded-full"><i class="ph-bold ph-spinner animate-spin text-sm"></i>更新資料中</div>' : ''}
          </div>

          <a href="https://line.me/ti/g2/o9nGL-WLgvJbVdeXDwcnQhOiNhPzt-rxycgEHg?utm_source=invitation&utm_medium=link_copy&utm_campaign=default" target="_blank" onclick="window.trackEvent('click_affiliate', {target: 'LINE_Community'})" class="block group relative w-full h-32 sm:h-40 rounded-3xl overflow-hidden cursor-pointer shadow-sm hover:shadow-xl transition-all duration-300">
            <img src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1200&q=80" loading="lazy" decoding="async" alt="LINE 社群" class="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"/>
            <div class="absolute inset-0 bg-gradient-to-r from-gray-900/80 via-gray-900/50 to-transparent"></div>
            <div class="absolute inset-0 flex flex-col justify-center p-6 sm:p-8">
              <div class="flex items-center gap-2 mb-2">
                <img src="https://upload.wikimedia.org/wikipedia/commons/4/41/LINE_logo.svg" alt="LINE" class="w-5 h-5 drop-shadow-md" />
                <span class="text-[#06C755] font-bold tracking-widest text-sm drop-shadow-md">LINE 專屬社群</span>
              </div>
              <h3 class="text-xl sm:text-2xl font-black text-white mb-1 drop-shadow-lg">艾迪王旅人經驗談及優惠情報站</h3>
              <p class="text-gray-100 text-xs sm:text-sm drop-shadow-md font-medium">第一手清艙機票、旅遊情報不漏接，點擊立即加入！</p>
            </div>
          </a>

          <a href="https://esimconnect.com.tw/#/access/esimbuy?referencecode=eddiewang" target="_blank" onclick="window.trackEvent('click_affiliate', {target: 'eSIM_Banner'})" class="block group relative w-full h-32 sm:h-40 rounded-3xl overflow-hidden cursor-pointer shadow-sm hover:shadow-xl transition-all duration-300">
            <img src="https://images.unsplash.com/photo-1523206489230-c012c64b2b48?auto=format&fit=crop&w=1200&q=80" loading="lazy" decoding="async" alt="eSIM 推薦" class="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"/>
            <div class="absolute inset-0 bg-gradient-to-r from-gray-900/70 via-gray-900/30 to-transparent"></div>
            <div class="absolute inset-0 flex flex-col justify-center p-6 sm:p-8">
              <div class="flex items-center gap-2 mb-2">
                <i class="ph-bold ph-sim-card text-blue-400 text-2xl drop-shadow-md"></i>
                <span class="text-blue-400 font-bold tracking-widest text-sm drop-shadow-md">e心通 eSIM</span>
              </div>
              <h3 class="text-xl sm:text-3xl font-black text-white mb-1 drop-shadow-lg">艾迪王專屬 9 折優惠</h3>
              <p class="text-gray-100 text-xs sm:text-sm drop-shadow-md font-medium">出國上網不斷線，點擊立即享有折扣</p>
            </div>
          </a>

          <a href="https://www.kkday.com/zh-tw?cid=22649" target="_blank" onclick="window.trackEvent('click_affiliate', {target: 'KKday_Banner'})" class="block group relative w-full h-32 sm:h-40 rounded-3xl overflow-hidden cursor-pointer shadow-sm hover:shadow-xl transition-all duration-300">
            <img src="https://images.unsplash.com/photo-1499856871958-5b9627545d1a?auto=format&fit=crop&w=1200&q=80" loading="lazy" decoding="async" alt="KKday 行程推薦" class="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"/>
            <div class="absolute inset-0 bg-gradient-to-r from-gray-900/70 via-gray-900/30 to-transparent"></div>
            <div class="absolute inset-0 flex flex-col justify-center p-6 sm:p-8">
              <div class="flex items-center gap-2 mb-2">
                <i class="ph-bold ph-ticket text-[#26C2CD] text-2xl drop-shadow-md"></i>
                <span class="text-[#26C2CD] font-bold tracking-widest text-sm drop-shadow-md">體驗與票券</span>
              </div>
              <h3 class="text-xl sm:text-3xl font-black text-white mb-1 drop-shadow-lg">KKday 熱門行程推薦</h3>
              <p class="text-gray-100 text-xs sm:text-sm drop-shadow-md font-medium">探索在地體驗、交通票券、一日遊，點擊選購</p>
            </div>
          </a>

          <!-- 新增：站長實走宮崎行程專區 -->
          <a href="https://www.eddietour.tw/miyazaki.html" onclick="window.trackEvent('click_outbound', {target: 'Miyazaki_Itinerary'})" class="block group relative w-full h-32 sm:h-40 rounded-3xl overflow-hidden cursor-pointer shadow-sm hover:shadow-xl transition-all duration-300">
            <img src="https://image.kkday.com/v2/image/get/s1.kkday.com/product_181723/20240606032942_TEFPm/jpg" loading="lazy" decoding="async" alt="宮崎實走行程" class="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"/>
            <div class="absolute inset-0 bg-gradient-to-r from-gray-900/80 via-gray-900/50 to-transparent"></div>
            <div class="absolute inset-0 flex flex-col justify-center p-6 sm:p-8">
              <div class="flex items-center gap-2 mb-2">
                <i class="ph-bold ph-footprints text-yellow-400 text-2xl drop-shadow-md"></i>
                <span class="text-yellow-400 font-bold tracking-widest text-sm drop-shadow-md">站長實走特輯</span>
              </div>
              <h3 class="text-xl sm:text-3xl font-black text-white mb-1 drop-shadow-lg">日本宮崎・神話秘境之旅</h3>
              <p class="text-gray-100 text-xs sm:text-sm drop-shadow-md font-medium">五天四夜懶人包行程！私房景點、住宿推薦一次看</p>
            </div>
          </a>

          <!-- 新增：站長實走辻川山公園行程專區 -->
          <a href="https://www.eddietour.tw/Fukusaki.html" onclick="window.trackEvent('click_outbound', {target: 'Fukusaki_Itinerary'})" class="block group relative w-full h-32 sm:h-40 rounded-3xl overflow-hidden cursor-pointer shadow-sm hover:shadow-xl transition-all duration-300">
            <img src="https://i.meee.com.tw/5ATEBid.jpg" loading="lazy" decoding="async" alt="兵庫福崎町｜辻川山公園" class="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"/>
            <div class="absolute inset-0 bg-gradient-to-r from-gray-900/80 via-gray-900/50 to-transparent"></div>
            <div class="absolute inset-0 flex flex-col justify-center p-6 sm:p-8">
              <div class="flex items-center gap-2 mb-2">
                <i class="ph-bold ph-footprints text-yellow-400 text-2xl drop-shadow-md"></i>
                <span class="text-yellow-400 font-bold tracking-widest text-sm drop-shadow-md">福崎町妖怪資訊</span>
              </div>
              <h3 class="text-xl sm:text-3xl font-black text-white mb-1 drop-shadow-lg">日本兵庫・朝聖妖怪小鎮</h3>
              <p class="text-gray-100 text-xs sm:text-sm drop-shadow-md font-medium">喜歡妖怪文化的不要錯過！</p>
            </div>
          </a>
          
          <div class="relative w-full h-32 sm:h-40 rounded-3xl overflow-hidden cursor-not-allowed shadow-sm border border-gray-200">
            <img src="https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=1200&q=80" loading="lazy" decoding="async" alt="團購代購" class="absolute inset-0 w-full h-full object-cover grayscale opacity-60"/>
            <div class="absolute inset-0 bg-gray-900/40 backdrop-blur-[2px]"></div>
            <div class="absolute inset-0 flex flex-col justify-center items-center p-6 text-center">
              <i class="ph-bold ph-shopping-bag text-white text-3xl mb-2 drop-shadow-md"></i>
              <h3 class="text-xl sm:text-2xl font-black text-white mb-1 drop-shadow-lg">精選團購 ． 國外代購</h3>
              <span class="inline-block mt-2 px-3 py-1 bg-gray-800 text-gray-200 text-xs font-bold rounded-full border border-gray-500 shadow-sm">即將推出 敬請期待</span>
            </div>
          </div>
        </div>
      `;

      const countryIntroHTML = `<section aria-labelledby="country-explore-title" class="text-center max-w-2xl mx-auto pt-4 sm:pt-6 pb-6 sm:pb-8"><p class="text-xs font-bold tracking-widest text-blue-600 mb-3">依國家探索</p><h2 id="country-explore-title" class="text-3xl sm:text-4xl font-black tracking-tight text-gray-900 mb-3">下一站，想去哪裡？</h2><p class="text-sm sm:text-base text-gray-500 leading-relaxed">點選下方國家圖卡，探索機票、行程與住宿。</p></section>`;

      return `<div class="${state.animateTransition ? 'slide-in-from-bottom-4' : ''}"><div class="text-center max-w-2xl mx-auto mb-10"><h1 class="text-3xl font-black text-gray-900 mb-4 tracking-tight">找尋您的下一個目的地</h1><p class="text-gray-500 mb-6">探索最新晚鳥清艙機票與飯店總覽</p></div>${getQuickSearchHTML()}${countryIntroHTML}<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-4 sm:gap-6">${cardsHTML}</div>${bannersHTML}</div>`;
    }

    function getFlightsHTML() {
      const availableTabs = state.selectedCountryObj.tabs.filter(tab => {
          return state.tickets.some(t => {
              const matchCountry = t.country === state.selectedCountryObj.country;
              const matchCity = tab.cities.some(c => c === '其他航點' || t.city.includes(c) || c.includes(t.city));
              return matchCountry && matchCity;
          });
      });

      if (availableTabs.length === 0) {
          return `
            <div class="fade-in">
              <div class="flex items-center gap-4 mb-8">
                <button aria-label="返回首頁" onclick="goHome()" class="p-2.5 bg-white border border-gray-200 rounded-full flex items-center justify-center shadow-sm"><i class="ph-bold ph-arrow-left text-xl"></i></button>
                <h1 class="text-2xl font-black">${escapeHTML(state.selectedCountryObj.country)} 機票與行程</h1>
              </div>
              <div class="py-24 text-center text-gray-500 bg-white rounded-3xl border border-gray-100 shadow-sm">
                <i class="ph-bold ph-airplane-tilt text-5xl text-gray-300 mb-4"></i>
                <p class="font-bold text-gray-700 text-lg mb-2">目前該地區暫無任何清艙機票或行程唷！</p>
              </div>
            </div>
          `;
      }

      if (!state.selectedTab || !availableTabs.find(t => t.label === state.selectedTab)) {
          state.selectedTab = availableTabs[0].label;
      }

      const activeTabObj = availableTabs.find(t => t.label === state.selectedTab);
      const allowedCities = activeTabObj ? activeTabObj.cities : [];
      const filteredTickets = state.tickets.filter(t => {
          const matchCountry = t.country === state.selectedCountryObj.country;
          const matchCity = allowedCities.some(c => c === '其他航點' || t.city.includes(c) || c.includes(t.city));
          return matchCountry && matchCity && matchesFilters(t,false);
      });
      
      const pillsHTML = availableTabs.map(tab => { 
        let displayCities = tab.cities.filter(c => c !== tab.label && c !== '北海道' && c !== '沖繩' && c !== '其他航點'); 
        if (displayCities.length === 0) displayCities = tab.cities; 
        const subText = displayCities.slice(0, 2).join(' · '); 
        const isSelected = state.selectedTab === tab.label; 
        return `<button onclick="selectTab('${tab.label}')" class="flex flex-col items-center justify-center px-4 py-2 rounded-2xl border transition-all ${isSelected ? 'bg-gray-900 text-white border-gray-900 shadow-md ring-1 ring-gray-900' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}"><span class="text-sm font-bold whitespace-nowrap">${tab.label}</span><span class="text-[10px] mt-0.5 font-medium whitespace-nowrap ${isSelected ? 'text-gray-300' : 'text-gray-400'}">${subText}</span></button>`; 
      }).join('');

      const availableMonths = [...new Set(filteredTickets.map(t => t.date.substring(0, 7)))].sort();
      let year = state.currentDate.getFullYear();
      let month = state.currentDate.getMonth();
      let currentMonthStr = `${year}-${String(month + 1).padStart(2, '0')}`;

      if (!state.monthFilter && availableMonths.length > 0 && !availableMonths.includes(currentMonthStr)) {
          const [y, m] = availableMonths[0].split('-');
          state.currentDate = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
          year = state.currentDate.getFullYear();
          month = state.currentDate.getMonth();
          currentMonthStr = availableMonths[0];
      }

      const monthButtonsHTML = availableMonths.length > 0 && state.viewMode === 'calendar' ? `
        <div class="flex flex-wrap gap-2 mb-4 fade-in">
          ${availableMonths.map(mStr => {
              const [y, m] = mStr.split('-');
              const isSelected = mStr === currentMonthStr;
              return `<button aria-label="${y}年${parseInt(m,10)}月" aria-pressed="${isSelected}" onclick="setMonth(${y}, ${m-1})" class="px-4 py-2 rounded-xl text-sm font-bold transition-all ${isSelected ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}">${y}年 ${parseInt(m, 10)}月</button>`;
          }).join('')}
        </div>
      ` : '';
      
      const supportStationHTML = `
        <div class="mb-8 p-4 sm:p-5 bg-gradient-to-r from-blue-50 to-cyan-50 rounded-2xl border border-blue-100 flex flex-col md:flex-row items-center justify-between gap-4 fade-in">
          <div class="flex items-center gap-2.5 w-full md:w-auto">
            <div class="bg-blue-600 text-white p-1.5 rounded-lg"><i class="ph-bold ph-sparkle text-lg"></i></div>
            <div>
              <div class="font-black text-sm text-blue-900">${escapeHTML(state.selectedCountryObj.country)} 旅遊應援站</div>
              <div class="text-xs text-blue-700/80">出發前必備，為您備妥專屬優惠</div>
            </div>
          </div>
          <div class="flex flex-wrap gap-2 w-full md:w-auto">
            <a href="https://esimconnect.com.tw/#/access/esimbuy?referencecode=eddiewang" target="_blank" onclick="window.trackEvent('click_affiliate', {target: 'eSIM_Support_Banner'})" class="flex-1 md:flex-none flex items-center justify-center gap-1.5 bg-white hover:bg-blue-600 hover:text-white text-gray-700 px-4 py-2.5 rounded-xl text-xs font-bold border border-gray-200">eSIM 9折</a>
            <a href="https://www.kkday.com/zh-tw?cid=22649" target="_blank" onclick="window.trackEvent('click_affiliate', {target: 'KKday_Support_Banner'})" class="flex-1 md:flex-none flex items-center justify-center gap-1.5 bg-white hover:bg-[#26C2CD] hover:text-white text-gray-700 px-4 py-2.5 rounded-xl text-xs font-bold border border-gray-200">KKday 特惠</a>
          </div>
        </div>`;
      
      let contentHTML = '';
      
      if (state.viewMode === 'hotels') {
        const filteredHotels = state.hotels.filter(h => {
          const matchCountry = h.country === state.selectedCountryObj.country;
          
          const matchCity = allowedCities.some(c => 
            c === '其他航點' ||
            (h.city && h.city.includes(c)) || 
            c.includes(h.city) || 
            (h.normalizedCity && h.normalizedCity.includes(c)) ||
            (h.normalizedCity && c.includes(h.normalizedCity))
          );
          
          return matchCountry && matchCity;
        });
        if (filteredHotels.length === 0) {
          contentHTML = `<div class="py-20 text-center text-gray-500 bg-white rounded-3xl border border-gray-100 shadow-sm fade-in"><i class="ph-bold ph-buildings text-5xl text-gray-300 mb-4"></i><p class="font-bold text-gray-700 text-lg mb-2">這個地區目前還沒有社群推薦飯店唷！</p></div>`;
        } else {
          contentHTML = `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 fade-in">${filteredHotels.map(h => {
            const searchUrl = safeHttpUrl(h.link) || `https://www.google.com/search?q=${encodeURIComponent(h.country + ' ' + h.city + ' ' + h.name)}`;
            const submitterHtml = h.submitter ? `<div class="mt-4 flex items-center justify-end gap-1.5 text-[11px] font-bold text-gray-400"><i class="ph-fill ph-user-circle text-[14px]"></i> @${escapeHTML(h.submitter)} 熱心分享</div>` : '';

            return `
              <div class="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow-lg transition-all flex flex-col justify-between h-full group">
                <div>
                  <span class="inline-flex items-center gap-1 bg-blue-50 text-blue-600 text-[10px] font-bold px-2.5 py-1.5 rounded-lg mb-3"><i class="ph-bold ph-map-pin"></i> ${escapeHTML(h.city)}</span>
                  <h3 class="text-xl font-black text-gray-900 mb-4 leading-tight group-hover:text-blue-600 transition-colors">${escapeHTML(h.name)}</h3>
                  <div class="text-sm text-gray-600 bg-gray-50 p-4 rounded-xl mb-5 leading-relaxed relative"><i class="ph-fill ph-quotes text-gray-200 absolute top-2 right-2 text-3xl opacity-50"></i><span class="relative z-10 block pr-6 selectable-text">${escapeHTML(h.description)}</span></div>
                  ${submitterHtml}
                </div>
                <a href="${escapeHTML(searchUrl)}" target="_blank" onclick="window.trackEvent('click_outbound', ${eventParams({target: 'Hotel_Search', hotel_name: h.name})})" class="w-full bg-gray-900 hover:bg-blue-600 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all text-sm shadow-sm">前往搜尋查看</a>
              </div>`;
          }).join('')}</div>`;
        }
      } else if (state.viewMode === 'list') {
         const todayStr = taipeiToday();
         let upcoming = filteredTickets.filter(t => t.date >= todayStr && matchesFilters(t));
         
         if (state.listSortBy === 'date') {
           upcoming.sort((a,b) => {
             if (a.date !== b.date) return a.date.localeCompare(b.date);
             return (parseInt((a.price||'').replace(/\D/g, '')) || 999999) - (parseInt((b.price||'').replace(/\D/g, '')) || 999999);
           });
         } else {
           upcoming.sort((a,b) => (parseInt((a.price||'').replace(/\D/g, '')) || 999999) - (parseInt((b.price||'').replace(/\D/g, '')) || 999999));
         }

         const sortUI = upcoming.length > 0 ? `<div class="flex items-center justify-end gap-2 mb-4 fade-in"><span class="text-sm font-bold text-gray-500">排序：</span><div class="bg-gray-100 p-1 rounded-lg flex text-xs font-bold"><button onclick="setListSortBy('price')" class="px-3 py-1.5 rounded-md transition-all ${state.listSortBy !== 'date' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}">最低金額</button><button onclick="setListSortBy('date')" class="px-3 py-1.5 rounded-md transition-all ${state.listSortBy === 'date' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}">出發日期</button></div></div>` : '';

         const listHTML = upcoming.slice(0,state.listLimit).map(offerCardHTML).join('');
         contentHTML = upcoming.length === 0 ? emptyResultsHTML() : `${sortUI}<div class="grid grid-cols-1 md:grid-cols-2 gap-4 fade-in">${listHTML}</div>${moreResultsHTML(upcoming.length)}`;
      } else {
        const prefix = currentMonthStr;
        const monthTickets = filteredTickets.filter(t => t.date.startsWith(prefix));
        
        if (monthTickets.length === 0) {
          contentHTML = `
            ${monthButtonsHTML}
            <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden fade-in">
              <div class="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center gap-2.5">
                <i class="ph-bold ph-calendar-check text-blue-600 text-xl"></i>
                <h2 class="text-lg font-black text-gray-800">${year}年 ${month + 1}月</h2>
              </div>
              <div class="py-24 text-center text-gray-500"><i class="ph-bold ph-calendar-x text-5xl text-gray-300 mb-4"></i><p class="font-bold text-gray-700 text-lg mb-2">這個月暫時沒有機票或行程唷！</p></div>
            </div>`;
        } else {
          let blanks = Array(new Date(year, month, 1).getDay()).fill(null);
          let days = Array.from({ length: new Date(year, month+1, 0).getDate() }, (_, i) => i + 1);
          contentHTML = `
            ${monthButtonsHTML}
            <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden fade-in">
              <div class="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center gap-2.5">
                <i class="ph-bold ph-calendar-check text-blue-600 text-xl"></i>
                <h2 class="text-lg font-black text-gray-800">${year}年 ${month + 1}月</h2>
              </div>
              <div class="grid grid-cols-7 gap-px bg-gray-100 border-b border-gray-100">${['日', '一', '二', '三', '四', '五', '六'].map(d => `<div class="bg-white py-3 text-center text-xs font-bold text-gray-400">${d}</div>`).join('')}</div>
              <div class="grid grid-cols-7 gap-px bg-gray-100">
                ${blanks.map(() => `<div class="bg-white/50 min-h-[80px]"></div>`).join('')}
                ${days.map(d => { 
                  const dateStr = `${prefix}-${String(d).padStart(2, '0')}`;
                  const dayTickets = filteredTickets.filter(t => t.date === dateStr); 
                  return `
                    <div class="bg-white min-h-[80px] p-1 transition-all ${dayTickets.length ? 'cursor-pointer' : 'text-gray-400'}" ${dayTickets.length ? `role="button" tabindex="0" aria-label="${dateStr}，${dayTickets.length} 個方案" onclick="openModal('${dateStr}')"` : ''}>
                      <div class="text-[10px] sm:text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full mb-1 ${dateStr === taipeiToday() ? 'bg-gray-900 text-white' : 'text-gray-700'}">${d}</div>
                      <div class="flex flex-col gap-1">
                        ${dayTickets.map(t => {
                          const boxClass = t.isTour ? 'bg-orange-50 text-orange-700' : (t.isFlightAndHotel ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700');
                          const extraLabel = t.isTour ? '<span class="text-[7px] leading-tight opacity-90 mt-[1px]">跟團行程</span>' : (t.isFlightAndHotel ? '<span class="text-[7px] leading-tight opacity-90 mt-[1px]">機加酒</span>' : '');
                          const warningIcon = t.isWarning ? '<span class="absolute -top-1 -right-1 flex h-2.5 w-2.5"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500 border border-white"></span></span>' : '';
                          return `
                          <div class="relative text-[9px] px-0.5 py-0.5 ${boxClass} rounded font-black text-center flex flex-col items-center ${t.isWarning ? 'ring-1 ring-red-400 shadow-sm' : ''}">
                            ${warningIcon}
                            <span class="whitespace-nowrap">${formatPrice(t.price || '有票')}</span>
                            ${compactPriceUnit(t)?'<span class="text-[9px] leading-tight">兩人合計</span>':''}
                            ${extraLabel}
                          </div>
                        `}).join('')}
                      </div>
                    </div>`; 
                }).join('')}
              </div>
            </div>`;
        }
      }
      return `
        <div class="fade-in">
          <div class="flex items-center justify-between mb-6 flex-wrap">
            <div class="flex items-center gap-4">
              <button aria-label="返回首頁" onclick="goHome()" class="p-2.5 bg-white border border-gray-200 rounded-full flex items-center justify-center shadow-sm"><i class="ph-bold ph-arrow-left text-xl"></i></button>
              <h1 class="text-2xl font-black">${escapeHTML(state.selectedCountryObj.country)} ${state.viewMode === 'hotels' ? '住宿推薦' : '機票與行程'}</h1>
            </div>
            <div class="flex items-center bg-gray-100 p-1 rounded-xl w-full sm:w-auto mt-4 sm:mt-0">
              <button onclick="setViewMode('calendar')" class="flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all ${state.viewMode==='calendar' ? 'bg-white shadow-sm text-gray-900':'text-gray-500'}">月曆</button>
              <button onclick="setViewMode('list')" class="flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all ${state.viewMode==='list' ? 'bg-white shadow-sm text-gray-900':'text-gray-500'}">列表</button>
              <button onclick="setViewMode('hotels')" class="flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all ${state.viewMode==='hotels' ? 'bg-white shadow-sm text-gray-900':'text-gray-500'}">找飯店</button>
            </div>
          </div>
          <div class="flex flex-wrap gap-2.5 mb-8">${pillsHTML}</div>
          ${contentHTML}
          <div class="mt-8">${supportStationHTML}</div>
        </div>`;
    }

    function renderModal() {
      const modalRoot = document.getElementById('modal-root');
      const wasOpen=!!modalRoot.querySelector?.('[role=dialog]');
      const hadFocus=modalRoot.contains?.(document.activeElement);
      if (!state.isModalOpen || !state.selectedDateTickets) { modalRoot.innerHTML = ''; setModalBackground(false); return; }
      modalSyncState=modalSourceState();
      const single=state.selectedDateTickets.tickets.length===1 ? state.selectedDateTickets.tickets[0] : null;
      const contentHTML = state.selectedDateTickets.tickets.map((item, index) => {
        
        
        const extraLabels = (item.isTour ? ' · 跟團行程' : (item.isFlightAndHotel ? ' · 機+酒' : '')) + (item.isBogo ? ' · 買一送一' : '');
        
        const targetUrl = safeHttpUrl(item.link) || safeHttpUrl(item.details.match(/https?:\/\/[^\s]+/)?.[0]);
        
        const isTour = item.isTour;
        const iconClass = isTour ? 'ph-flag-pennant' : 'ph-airplane-tilt';
        const tagClass = isTour ? 'text-orange-600 bg-orange-50 border-orange-100' : 'text-blue-600 bg-blue-50 border-blue-100';
        const airlineTagHtml = item.airlineTag ? `<span class="inline-flex items-center gap-1 ${tagClass} text-xs font-bold px-2 py-1 rounded-md mb-2 border"><i class="ph-bold ${iconClass}"></i> ${escapeHTML(item.airlineTag)}</span>` : '';
        
        const warningBanner = item.isWarning ? `
          <div class="bg-red-50 border border-red-200 p-3.5 rounded-xl mb-4 flex items-start gap-2.5 text-red-700 shadow-sm">
            <i class="ph-fill ph-warning-circle text-xl shrink-0 mt-0.5"></i>
            <div>
              <strong class="text-sm font-black tracking-wide">機位需人工確認</strong>
              <p class="text-xs mt-1 font-medium leading-relaxed opacity-90">接近目前設定的開票門檻，或廠商標示需確認；請透過 LINE 確認機位與實際開票期限。</p>
            </div>
          </div>
        ` : '';

        return `
          <div class="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm ${index !== 0 ? 'mt-4' : ''} ${item.isWarning ? 'ring-2 ring-red-400/50' : ''}">
            ${warningBanner}
            <div class="flex justify-between items-start mb-4">
              <div>
                <div class="flex flex-wrap items-center gap-1.5">
                  <span class="inline-flex items-center gap-1 bg-gray-100 text-gray-600 text-xs font-bold px-2 py-1 rounded-md mb-2">${escapeHTML(item.country)} · ${escapeHTML(item.city)}${extraLabels}</span>
                  ${airlineTagHtml}
                </div>
                <h4 class="text-lg font-black text-gray-900">${escapeHTML(item.airline)}</h4>
              </div>
              ${item.price ? `<div class="text-right shrink-0 ml-2"><p class="text-xs text-gray-500">${quoteLabel(item)}</p><p class="text-xl font-black text-red-500">$${formatPrice(item.price)}</p></div>` : ''}
            </div>
            <div class="bg-gray-50 p-4 rounded-xl text-sm text-gray-600 leading-relaxed">${offerFactsHTML(item)}<p class="text-xs text-gray-500 mt-3">${state.sources[item.source]?.error?'目前顯示上次資料，最新報價尚未核對。':'機位、計價方式與總額依旅行社確認。'}</p></div>
            <details class="mt-3 text-sm text-gray-600"><summary class="cursor-pointer font-bold py-2">查看完整廠商資訊</summary><div class="bg-gray-50 p-4 rounded-xl whitespace-pre-wrap leading-relaxed">${escapeHTML(item.details)}</div></details>
            <div data-share class="mt-2"><button type="button" onclick="copyOfferLink(this,'${escapeHTML(item.id)}')" class="min-h-[44px] text-xs text-blue-600 underline">複製此商品分享連結</button><p role="status" aria-live="polite" class="text-xs text-gray-600"></p><input hidden readonly aria-label="此商品分享網址" value="${escapeHTML(shareUrl(item.id))}" onclick="this.select()" class="mt-2 w-full min-w-0 rounded-lg border border-gray-200 p-2 text-xs bg-white text-gray-700"></div>
            
            <div class="mt-3 flex items-start gap-1.5 text-[11px] text-gray-400 leading-tight">
              <i class="ph-bold ph-info text-xs mt-0.5 shrink-0"></i>
              <span>機位與名額依旅行社即時查詢為準，點擊 LINE 可帶入商品資訊，尚未完成訂購。</span>
            </div>

            ${single?'':`<div class="mt-3">${state.sources[item.source]?.error?generalContactHTML():inquiryButtonHTML(item)}</div>`}
            <a href="https://esimconnect.com.tw/#/access/esimbuy?referencecode=eddiewang" target="_blank" rel="noreferrer" class="mt-5 p-3.5 bg-gradient-to-r from-gray-900 to-gray-800 rounded-xl flex items-center justify-between shadow-md cursor-pointer hover:scale-[1.02] transition-transform border border-gray-700" onclick="window.trackEvent('click_affiliate', {target: 'eSIM_Modal'})">
              <div class="flex flex-col">
                <span class="text-yellow-400 text-[10px] font-bold mb-0.5 tracking-wider flex items-center gap-1">
                  <i class="ph-fill ph-lightbulb"></i> ${isTour ? '訂好行程了嗎？' : '訂好機票了嗎？'}
                </span>
                <span class="text-white text-sm font-black">領取艾迪王專屬 eSIM 優惠</span>
              </div>
              <div class="bg-white/20 p-1.5 rounded-lg text-white">
                <i class="ph-bold ph-caret-right"></i>
              </div>
            </a>

            ${(item.isTour && targetUrl) ? `<a href="${escapeHTML(targetUrl)}" target="_blank" rel="noreferrer" onclick="window.trackEvent('click_outbound', ${eventParams({target: 'Tour_Detail', url: targetUrl})})" class="mt-3 w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all transform hover:scale-[1.02] shadow-sm"><i class="ph-bold ph-notebook text-xl"></i> 查看行程資訊</a>` : ''}
            

          </div>
        `;
      }).join('');
      const footer=single?`<div class="inquiry-footer px-4 py-3 border-t border-gray-200 bg-white shrink-0"><div class="flex items-center gap-3">${state.sources[single.source]?.error?`<div class="text-xs text-amber-800 flex-1">最新報價尚未核對<br>可請客服協助查詢</div>${generalContactHTML()}`:`<div class="shrink-0"><p class="text-xs text-gray-500">${quoteLabel(single)}</p><p class="text-xl font-black text-red-500">$${formatPrice(single.price)}</p></div><div class="flex-1 min-w-0">${inquiryButtonHTML(single)}</div>`}</div></div>`:'';
      modalRoot.innerHTML = `<div class="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-gray-900/40 backdrop-blur-sm fade-in" onclick="if(event.target===this) closeModal()"><div role="dialog" aria-modal="true" aria-labelledby="ticket-dialog-title" tabindex="-1" class="ticket-dialog bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden zoom-in-95 relative flex flex-col"><div class="px-4 py-3 border-b border-gray-100 flex items-center justify-between shrink-0"><div><h3 id="ticket-dialog-title" class="text-lg font-bold text-gray-900">${escapeHTML(state.selectedDateTickets.date)}</h3><p class="text-xs text-gray-500 mt-1">選日期 → 旅行社確認 → 付款開票</p></div><button aria-label="關閉詳情" onclick="closeModal()" class="p-3 bg-gray-50 hover:bg-gray-100 text-gray-500 rounded-full flex items-center justify-center"><i class="ph-bold ph-x text-xl"></i></button></div><div class="p-4 overflow-y-auto bg-gray-50/50 flex-1 min-h-0">${state.modalNotice ? `<p role="status" class="bg-amber-50 text-amber-900 p-3 rounded-xl mb-3">${escapeHTML(state.modalNotice)}</p>` : ''}${contentHTML}</div>${footer}</div></div>`;
      setModalBackground(true);
      if(!wasOpen || hadFocus) modalRoot.querySelector?.('[role=dialog]')?.focus({preventScroll:true});
    }

    function getLoadErrorHTML(hasSavedData) {
      return `<div role="alert" class="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-6 text-amber-900">
        <p class="font-bold mb-2">資料暫時無法載入</p>
        <p class="text-sm mb-4">${hasSavedData ? '目前顯示上次載入的資料，最新機位與票價請向旅行社確認。' : '目前無法取得最新機票與行程，請確認網路連線後重新載入。'}</p>
        <div class="flex flex-wrap gap-3"><button aria-label="重新同步資料" onclick="forceRefresh()" class="bg-amber-900 text-white rounded-xl px-4 py-3 text-sm font-bold">重新載入資料</button>${generalContactHTML()}</div>
      </div>`;
    }

    function renderMain() {
      const el = document.getElementById('main-content');
      if (state.isLoading && state.loadError === false && !state.tickets.length && !state.hotels.length) {
        el.innerHTML = getLoadingHTML();
        return;
      }
      if (state.loadError && !state.tickets.length && !state.hotels.length) {
        el.innerHTML = getLoadErrorHTML(false);
        return;
      }
      if (!state.selectedCountryObj && !state.searchQuery) el.innerHTML = getHomeHTML(); 
      else if (state.searchQuery || state.selectedCountryObj?.isSearch) el.innerHTML = getSearchHTML(); 
      else if (state.selectedCountryObj?.isHotelsGlobal) el.innerHTML = getGlobalHotelsHTML(); 
      else el.innerHTML = getFlightsHTML(); 
      if (state.loadError) el.innerHTML = getLoadErrorHTML(true) + el.innerHTML;
      if((state.searchQuery || state.selectedCountryObj?.isSearch || state.selectedCountryObj?.tabs) && state.viewMode !== 'hotels') el.insertAdjacentHTML('afterbegin',getFiltersHTML());
      enhanceAccessibility(el);
      updateMetadata();
    }

    window.addEventListener('DOMContentLoaded', () => {
      restoreURL();
      document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible') fetchSheetData(); });
      window.addEventListener('online', () => fetchSheetData());
      setInterval(() => { if(document.visibilityState === 'visible') fetchSheetData(); },FRESH_MS);
      window.addEventListener('popstate', () => {restoreURL();renderMain();renderModal();if(state.pendingOffer){const id=state.pendingOffer;state.pendingOffer='';openOffer(id,'shared_link',false);}});
      fetchSheetData();
    });
  
