
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
      viewMode: 'calendar', searchQuery: '', listSortBy: 'price',
      origin: '', productType: '', monthFilter: '', sources: {}, lastSync: 0, modalNotice: '', inquirySource: 'card', pendingOffer: '' 
    };
    window.executeSearch = (q) => { 
        q = q.trim().toLowerCase(); 
        state.searchQuery = q; 
        if (q) { 
            state.selectedCountryObj = { isSearch: true }; 
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
        state.origin=''; state.productType=''; state.monthFilter=''; state.viewMode='calendar'; state.listSortBy='price'; syncURL(); 
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
        state.selectedCountryObj = countryObj; 
        state.selectedTab = countryObj.tabs[0].label; 
        state.viewMode = 'calendar'; 
         
        window.trackEvent('select_country', { country: countryObj.country }); 
      }
      state.currentDate = new Date(); state.monthFilter=''; state.searchQuery=''; document.getElementById('searchInput').value=''; syncURL();
      state.animateTransition = true; 
      renderMain(); 
      state.animateTransition = false; 
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    window.selectTab = (tabLabel) => { 
      state.selectedTab = tabLabel; 
      const countryObj = state.selectedCountryObj; 
      const tabObj = countryObj.tabs.find(t => t.label === tabLabel); 
       
      window.trackEvent('select_tab', { tab: tabLabel, country: countryObj.country }); 
      state.currentDate = new Date(); state.monthFilter=''; state.searchQuery=''; document.getElementById('searchInput').value=''; syncURL();
      state.animateTransition = false; 
      renderMain(); 
    };
    
    window.setViewMode = (mode) => { 
        state.viewMode = mode; syncURL();
        window.trackEvent('change_view_mode', { mode: mode }); 
        renderMain(); 
    };
    
    window.setListSortBy = (mode) => { state.listSortBy = mode; syncURL(); renderMain(); };
    
    window.setMonth = (y, m) => { 
        state.currentDate = new Date(y, m, 1); state.monthFilter = `${y}-${String(m+1).padStart(2,'0')}`; syncURL(); 
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
    function travelSummary(item) { return [item.origin&&'出發地：'+item.origin,item.duration,item.outboundInfo,item.inboundInfo,item.returnDate&&'回程日期：'+item.returnDate].filter(Boolean).join(' ｜ ') || '航班及回程日期請參考廠商原文或詢問客服。'; }
    function matchesFilters(item,includeMonth=true) {
      const type=item.isTour?'tour':item.isFlightAndHotel?'package':'ticket';
      return (!state.origin||item.origin===state.origin) && (!state.productType||type===state.productType) && (!includeMonth||!state.monthFilter||item.date.startsWith(state.monthFilter));
    }
    function getFiltersHTML() {
      const origins=[...new Set(state.tickets.map(t=>t.origin).filter(Boolean))].sort();
      const months=[...new Set(state.tickets.map(t=>t.date.slice(0,7)))].sort();
      const select=(name,label,options,current)=>`<label class="text-xs text-gray-500 font-bold">${label}<select aria-label="${label}" data-filter="${name}" onchange="setFilter('${name}',this.value)" class="ml-2 bg-white border border-gray-200 rounded-lg px-2 py-2 text-gray-700"><option value="">全部</option>${options.map(([value,text])=>`<option value="${escapeHTML(value)}" ${value===current?'selected':''}>${escapeHTML(text)}</option>`).join('')}</select></label>`;
      return `<div class="flex flex-wrap gap-3 mb-5" aria-label="商品篩選">${select('origin','出發地',origins.map(x=>[x,x]),state.origin)}${select('monthFilter','出發月份',months.map(x=>[x,x.replace('-',' 年 ')+' 月']),state.monthFilter)}${select('productType','商品類型',[['ticket','純機票'],['package','機加酒'],['tour','旅行團']],state.productType)}${state.origin||state.productType||state.monthFilter?'<button class="text-xs underline text-gray-500" onclick="clearFilters()">清除篩選</button>':''}</div>`;
    }
    window.setFilter=(key,value)=>{ if(!['origin','productType','monthFilter'].includes(key))return;state[key]=value;if(key==='monthFilter'&&value){const[y,m]=value.split('-');state.currentDate=new Date(+y,+m-1,1);}syncURL();renderMain();document.querySelector(`[data-filter="${key}"]`)?.focus(); };
    window.clearFilters=()=>{state.origin='';state.productType='';state.monthFilter='';syncURL();renderMain();};
    function safeUpdateURL(url,replace=false) {
      try { if(url !== location.pathname+location.search) history[replace?'replaceState':'pushState']({},'',url); } catch(_) {}
    }
    function viewParams() {
      const p=new URLSearchParams();
      if(state.searchQuery)p.set('q',state.searchQuery);
      else if(state.selectedCountryObj?.isHotelsGlobal)p.set('hotels','true');
      else if(state.selectedCountryObj?.slug){p.set('country',state.selectedCountryObj.slug);const tab=state.selectedCountryObj.tabs.find(t=>t.label===state.selectedTab);if(tab)p.set('tab',tab.slug);}
      if(state.viewMode!=='calendar')p.set('view',state.viewMode);
      if(state.listSortBy!=='price')p.set('sort',state.listSortBy);
      if(state.origin)p.set('origin',state.origin);
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
      state.searchQuery=p.get('q') || '';state.selectedCountryObj=null;state.selectedTab=null;
      state.viewMode=['calendar','list','hotels'].includes(p.get('view'))?p.get('view'):'calendar';
      state.listSortBy=p.get('sort')==='date'?'date':'price';
      state.origin=p.get('origin')||'';state.productType=['ticket','package','tour'].includes(p.get('type'))?p.get('type'):'';
      state.monthFilter=/^20\d{2}-(0[1-9]|1[0-2])$/.test(p.get('month'))?p.get('month'):'';
      const date=state.monthFilter || taipeiToday().slice(0,7);state.currentDate=new Date(+date.slice(0,4),+date.slice(5)-1,1);
      if(state.searchQuery)state.selectedCountryObj={isSearch:true};
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
    function updateSyncStatus(loading=false) {
      const el=document.getElementById('sync-status');if(!el)return;
      const parts=Object.entries(SOURCE_NAMES).map(([key,label])=>{
        const source=state.sources[key];
        if(!source?.data)return `${label}：${loading?'同步中':'暫無資料'}`;
        const time=new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(source.syncedAt));
        return `${label} ${time}${source.error?'（更新失敗，保留上次資料）':''}`;
      });
      el.textContent=(loading?'同步中 · ':'上次同步 · ')+parts.join(' · ');
    }
    let modalTrigger=null;
    function shareUrl(id) { return 'https://www.eddietour.tw/?offer='+encodeURIComponent(id); }
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
      }
    }
    function inquiryUrl(item) {
      const title=item.isTour?'跟團行程訂購公版':'清艙機票訂購公版';
      const fields=[title,'備註：eddie推薦(不可刪)',(item.isTour?'行程名稱：':'航空航點：')+item.airline+' '+item.country+item.city,'日期：'+item.date,'金額：$'+item.price,
        item.origin&&'出發地：'+item.origin,item.duration&&'天數：'+item.duration,item.outboundFlight&&'去程航班：'+item.outboundFlight,item.inboundFlight&&'回程航班：'+item.inboundFlight,item.returnDate&&'回程日期：'+item.returnDate,
        item.id&&'商品：'+item.id,item.version&&'版本：'+item.version,'姓名：',(item.isTour?'報名人數':'張數')+'：','聯絡電話：','聯絡信箱：'];
      return `https://line.me/R/oaMessage/${LINE_OFFICIAL_ID}/?`+encodeURIComponent(fields.filter(Boolean).join('\n'));
    }
    function prepareInquiry(event,id) {
      const item=state.tickets.find(t=>t.id===id);
      if(!item){event.preventDefault();showOffer(id,'inquiry',false);return false;}
      if(!sourceFresh(item.source)){
        event.preventDefault();state.modalNotice='正在核對最新資料，完成後請再次點擊 LINE 詢價。';renderModal();
        fetchSheetData(true).then(()=>{state.modalNotice=sourceFresh(item.source)?'已核對最新資料，請確認價格後再次點擊 LINE 詢價。':'目前無法核對最新票價，請重新同步資料後再試。';reconcileModal();renderModal();});
        return false;
      }
      window.trackEvent('click_conversion',{target:'LINE_Booking',type:item.isTour?'Tour':'Ticket',offer_id:item.id,origin:item.origin,destination:item.city,departure_date:item.date,value:Number(item.price)||0,currency:'TWD',source:state.inquirySource});
      return true;
    }
    function setModalBackground(open) {
      for(const el of document.querySelectorAll('nav,main,footer,#sync-status,body > div.fixed'))el.inert=open;
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
          <p class="text-xs text-gray-400 font-medium">首次載入約需 2~3 秒，請稍候</p>
        </div>`; 
    }

    function getSearchHTML() {
      const q = state.searchQuery;
      // 過濾搜尋結果
      const matchedTickets = state.tickets.filter(t => 
        (t.country && t.country.toLowerCase().includes(q)) || 
        (t.city && t.city.toLowerCase().includes(q)) || 
        (t.airline && t.airline.toLowerCase().includes(q)) || 
        (t.details && t.details.toLowerCase().includes(q))
      );
      
      let allMatches = matchedTickets.filter(matchesFilters);
      
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

      if (allMatches.length === 0) {
        return `
          <div class="fade-in">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div class="flex items-center gap-4">
                <button aria-label="返回首頁" onclick="goHome()" class="p-2.5 bg-white border border-gray-200 rounded-full flex items-center justify-center">
                  <i class="ph-bold ph-arrow-left text-xl"></i>
                </button>
                <h1 class="text-xl sm:text-2xl font-bold">搜尋結果: "${escapeHTML(state.searchQuery)}"</h1>
              </div>
            </div>
            <div class="text-center py-20 bg-white rounded-3xl border border-gray-100 shadow-sm">
              <i class="ph-bold ph-magnifying-glass text-5xl text-gray-300 mb-4"></i>
              <h3 class="text-xl font-bold text-gray-800 mb-2">找不到相關資訊</h3>
            </div>
          </div>
        `;
      }

      const listHTML = allMatches.map(t => { 
        const encodedItem = t.id; 
        const isTour = t.isTour;
        const iconClass = isTour ? 'ph-flag-pennant' : 'ph-airplane-tilt';
        const tagClass = isTour ? 'text-orange-600 bg-orange-50 border-orange-100' : 'text-blue-600 bg-blue-50 border-blue-100';
        const airlineTagHtml = t.airlineTag ? `<div class="text-[10px] sm:text-xs font-bold ${tagClass} inline-block px-2 py-1 rounded-md border"><i class="ph-bold ${iconClass}"></i> ${escapeHTML(t.airlineTag)}</div>` : '';
        const warningTagHtml = t.isWarning ? `<div class="text-[10px] sm:text-xs font-bold text-red-600 bg-red-50 inline-block px-2 py-1 rounded-md border border-red-100"><i class="ph-fill ph-warning-circle"></i> 需確認機位</div>` : '';
        
        return `
          <div class="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow-md cursor-pointer flex justify-between items-center ${t.isWarning ? 'ring-1 ring-red-400' : ''}" role="button" tabindex="0" data-offer="${escapeHTML(encodedItem)}" onclick="window.openModalFromItem('${encodedItem}')">
            <div>
              <div class="text-xs font-bold text-gray-500 mb-1.5 flex items-center gap-1.5"><i class="ph-bold ph-calendar-blank text-gray-400"></i> ${escapeHTML(t.date)}</div>
              <div class="font-black text-gray-900 text-lg line-clamp-1">${escapeHTML(t.title || t.airline)}</div>
              <div class="flex flex-wrap items-center gap-1.5 mt-1.5">
                <div class="text-[10px] sm:text-xs font-medium text-gray-600 bg-gray-50 inline-block px-2 py-1 rounded-md border border-gray-100">${escapeHTML(t.origin ? t.origin + ' → ' + (t.city || t.country) : t.city || t.country)}${t.isFlightAndHotel ? ' · 機+酒' : ''}</div>
                ${airlineTagHtml}
                ${warningTagHtml}
              </div>
            </div>
            <div class="text-right shrink-0 ml-4">
              <div class="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">優惠價</div>
              <div class="text-xl font-black text-red-500">$${formatPrice(t.price || '--')}</div>
            </div>
          </div>`; 
      }).join('');
      
      return `
        <div class="fade-in">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div class="flex items-center gap-4">
              <button aria-label="返回首頁" onclick="goHome()" class="p-2.5 bg-white border border-gray-200 rounded-full flex items-center justify-center">
                <i class="ph-bold ph-arrow-left text-xl"></i>
              </button>
              <h1 class="text-xl sm:text-2xl font-bold">搜尋結果: "${escapeHTML(state.searchQuery)}"</h1>
            </div>
            ${sortUI}
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            ${listHTML}
          </div>
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
            <div class="py-24 text-center text-gray-500 bg-white rounded-3xl border border-gray-100 shadow-sm"><i class="ph-bold ph-buildings text-5xl text-gray-300 mb-4"></i><p class="font-bold text-gray-700 text-lg mb-2">目前還沒有已核准的飯店資料唷！</p><p class="text-sm">如果有填寫表單，請記得至試算表的「核准」欄位填寫 Y 即可顯示。</p></div>
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

      let recentHTML = '';
      if (state.tickets.length > 0) {
          const tks = state.tickets.filter(t => !t.isTour).sort((a,b) => b.uploadIndex - a.uploadIndex).slice(0, 5);
          const trs = state.tickets.filter(t => t.isTour).sort((a,b) => b.uploadIndex - a.uploadIndex).slice(0, 5);
          const recentItems = [];
          for(let i=0; i<5; i++) {
              if (trs[i]) recentItems.push(trs[i]);
              if (tks[i]) recentItems.push(tks[i]);
          }

          const recentCards = recentItems.map(t => {
              const encodedItem = t.id; 
              const tagClass = t.isTour ? 'bg-orange-500' : 'bg-blue-500';
              const tagText = t.isTour ? '新行程' : '新機票';
              
              return `
                <div class="bg-white border border-gray-100 rounded-full px-3 py-1.5 shadow-sm hover:shadow-md cursor-pointer shrink-0 snap-start transition-all flex items-center gap-2" role="button" tabindex="0" data-offer="${escapeHTML(encodedItem)}" onclick="window.openModalFromItem('${encodedItem}')">
                  <span class="${tagClass} text-white text-[9px] font-black px-1.5 py-0.5 rounded tracking-widest">${tagText}</span>
                  <span class="text-[11px] sm:text-xs font-bold text-gray-800 truncate max-w-[130px]">${escapeHTML(t.city)} ${escapeHTML(t.date.slice(5).replace('-','/'))}出發</span>
                  <span class="text-[11px] sm:text-xs font-black text-red-500">$${formatPrice(t.price || '--')}</span>
                </div>
              `;
          }).join('');

          if (recentCards) {
            recentHTML = `
            <div class="mb-8 w-full animate-in fade-in duration-300">
              <div class="flex items-center gap-1.5 mb-2.5 px-2">
                <i class="ph-fill ph-lightning text-yellow-500 text-lg"></i>
                <h2 class="text-sm font-black text-gray-800 tracking-wide">最新快訊</h2>
              </div>
              <div class="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory no-scrollbar px-2 -mx-4 sm:mx-0">
                ${recentCards}
              </div>
            </div>
            `;
          }
      }

      return `<div class="${state.animateTransition ? 'slide-in-from-bottom-4' : ''}"><div class="text-center max-w-2xl mx-auto mb-10"><h1 class="text-3xl font-black text-gray-900 mb-4 tracking-tight">找尋您的下一個目的地</h1><p class="text-gray-500 mb-6">探索最新晚鳥清艙機票與飯店總覽</p><nav aria-label="熱門目的地" class="text-sm text-gray-500 mt-3"><a class="hover:text-blue-600" href="/destinations/osaka/">大阪</a> · <a class="hover:text-blue-600" href="/destinations/okinawa/">沖繩</a> · <a class="hover:text-blue-600" href="/destinations/seoul/">首爾</a></nav></div>${recentHTML}<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-4 sm:gap-6">${cardsHTML}</div>${bannersHTML}</div>`;
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
        return `<button onclick="selectTab('${tab.label}')" class="flex flex-col items-center justify-center px-4 py-2 rounded-2xl border transition-all ${isSelected ? 'bg-gray-900 text-white border-gray-900 shadow-md ring-1 ring-gray-900' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}"><span class="text-sm font-bold whitespace-nowrap">${tab.label}</span><span class="text-[10px] mt-0.5 font-medium whitespace-nowrap ${isSelected ? 'text-gray-600' : 'text-gray-400'}">${subText}</span></button>`; 
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
              return `<button aria-label="${y}年${parseInt(m,10)}月" aria-pressed="${isSelected}" onclick="setMonth(${y}, ${m-1})" class="px-4 py-2 rounded-xl text-sm font-bold transition-all ${isSelected ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}">${parseInt(m, 10)}月</button>`;
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

         const listHTML = upcoming.map(t => {
           const encodedItem = t.id; 
           const isTour = t.isTour;
           const iconClass = isTour ? 'ph-flag-pennant' : 'ph-airplane-tilt';
           const tagClass = isTour ? 'text-orange-600 bg-orange-50 border-orange-100' : 'text-blue-600 bg-blue-50 border-blue-100';
           const airlineTagHtml = t.airlineTag ? `<div class="text-[10px] sm:text-xs font-bold ${tagClass} inline-block px-2 py-1 rounded-md border"><i class="ph-bold ${iconClass}"></i> ${escapeHTML(t.airlineTag)}</div>` : '';
           const warningTagHtml = t.isWarning ? `<div class="text-[10px] sm:text-xs font-bold text-red-600 bg-red-50 inline-block px-2 py-1 rounded-md border border-red-100"><i class="ph-fill ph-warning-circle"></i> 需確認機位</div>` : '';
           
           return `
             <div class="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow-md cursor-pointer flex justify-between items-center ${t.isWarning ? 'ring-1 ring-red-400' : ''}" role="button" tabindex="0" data-offer="${escapeHTML(encodedItem)}" onclick="window.openModalFromItem('${encodedItem}')">
               <div>
                 <div class="text-xs font-bold text-gray-500 mb-1.5 flex items-center gap-1.5"><i class="ph-bold ph-calendar-blank text-gray-400"></i> ${escapeHTML(t.date)}</div>
                 <div class="font-black text-gray-900 text-lg line-clamp-1">${escapeHTML(t.title || t.airline)}</div>
                 <div class="flex flex-wrap items-center gap-1.5 mt-1.5">
                   <div class="text-[10px] sm:text-xs font-medium text-gray-600 bg-gray-50 inline-block px-2 py-1 rounded-md border border-gray-100">${escapeHTML(t.origin ? t.origin + ' → ' + (t.city || t.country) : t.city || t.country)}${t.isFlightAndHotel ? ' · 機+酒' : ''}</div>
                   ${airlineTagHtml}
                   ${warningTagHtml}
                 </div>
               </div>
               <div class="text-right shrink-0 ml-4">
                 <div class="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">優惠價</div>
                 <div class="text-xl font-black text-red-500">$${formatPrice(t.price || '--')}</div>
               </div>
             </div>`; 
         }).join('');
         
         contentHTML = upcoming.length === 0 ? `<div class="py-20 text-center text-gray-500 bg-white rounded-3xl border border-gray-100 shadow-sm"><i class="ph-bold ph-airplane-tilt text-4xl text-gray-300 mb-3"></i>目前暫無機票！</div>` : `${sortUI}<div class="grid grid-cols-1 md:grid-cols-2 gap-4 fade-in">${listHTML}</div>`;
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
          ${supportStationHTML}
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
        </div>`;
    }

    function renderModal() {
      const modalRoot = document.getElementById('modal-root');
      const wasOpen=!!modalRoot.querySelector?.('[role=dialog]');
      const hadFocus=modalRoot.contains?.(document.activeElement);
      if (!state.isModalOpen || !state.selectedDateTickets) { modalRoot.innerHTML = ''; setModalBackground(false); return; }
      const contentHTML = state.selectedDateTickets.tickets.map((item, index) => {
        
        const templateTitle = item.isTour ? '跟團行程訂購公版' : '清艙機票訂購公版';
        const targetInfo = item.isTour ? ('行程名稱：' + item.airline) : ('航空航點：' + item.airline + ' ' + item.country + item.city);
        const countLabel = item.isTour ? '報名人數' : '張數';
        const lineOaUrl = inquiryUrl(item);
        
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
              ${item.price ? `<div class="text-right text-xl font-black text-red-500">$${formatPrice(item.price)}</div>` : ''}
            </div>
            <div class="bg-gray-50 p-4 rounded-xl text-sm text-gray-600 leading-relaxed"><p class="font-bold">出發：${escapeHTML(item.date)} · $${formatPrice(item.price)}</p><p>${escapeHTML(travelSummary(item))}</p><p class="text-xs text-gray-400 mt-2">${state.sources[item.source]?.syncedAt ? '資料核對：'+escapeHTML(new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(state.sources[item.source].syncedAt))) : '實際票價請向旅行社確認'}</p></div>
            <details class="mt-3 text-sm text-gray-600"><summary class="cursor-pointer font-bold py-2">查看完整廠商資訊</summary><div class="bg-gray-50 p-4 rounded-xl whitespace-pre-wrap leading-relaxed">${escapeHTML(item.details)}</div></details>
            <a href="${escapeHTML(shareUrl(item.id))}" class="inline-block mt-2 text-xs text-blue-600 underline">此商品分享連結</a>
            
            <div class="mt-3 flex items-start gap-1.5 text-[11px] text-gray-400 leading-tight">
              <i class="ph-bold ph-info text-xs mt-0.5 shrink-0"></i>
              <span>機位與名額依旅行社即時查詢為準，點擊下方按鈕後請儘速聯絡確認。</span>
            </div>

            <a href="${escapeHTML(lineOaUrl)}" target="_blank" rel="noreferrer" data-inquiry="${escapeHTML(item.id)}" onclick="return prepareInquiry(event,'${item.id}')" class="mt-3 w-full bg-[#06C755] hover:bg-[#05b34c] text-white font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all transform hover:scale-[1.02] shadow-sm shadow-green-200/50"><i class="ph-bold ph-chat-circle-dots text-xl"></i> ${isTour ? '聯繫旅行社 LINE 報名' : '聯繫旅行社 LINE 搶購'}</a>
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
      modalRoot.innerHTML = `<div class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm fade-in" onclick="if(event.target===this) closeModal()"><div role="dialog" aria-modal="true" aria-labelledby="ticket-dialog-title" tabindex="-1" class="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden zoom-in-95 relative flex flex-col max-h-[85vh]"><div class="px-6 py-5 border-b border-gray-100 flex items-center justify-between shrink-0"><h3 id="ticket-dialog-title" class="text-xl font-bold text-gray-900 flex items-center gap-2"><i class="ph-bold ph-calendar-blank text-gray-400"></i> ${escapeHTML(state.selectedDateTickets.date)}</h3><button aria-label="關閉詳情" onclick="closeModal()" class="p-2 bg-gray-50 hover:bg-gray-100 text-gray-500 rounded-full flex items-center justify-center"><i class="ph-bold ph-x text-xl"></i></button></div><div class="p-6 overflow-y-auto bg-gray-50/50 flex-1 no-scrollbar">${state.modalNotice ? `<p role="status" class="bg-amber-50 text-amber-900 p-3 rounded-xl mb-3">${escapeHTML(state.modalNotice)}</p>` : ''}${contentHTML}</div></div></div>`;
      setModalBackground(true);
      if(!wasOpen || hadFocus) modalRoot.querySelector?.('[role=dialog]')?.focus({preventScroll:true});
    }

    function getLoadErrorHTML(hasSavedData) {
      return `<div role="alert" class="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-6 text-amber-900">
        <p class="font-bold mb-2">資料暫時無法載入</p>
        <p class="text-sm mb-4">${hasSavedData ? '目前顯示上次載入的資料，最新機位與票價請向旅行社確認。' : '目前無法取得最新機票與行程，請確認網路連線後重新載入。'}</p>
        <button aria-label="重新同步資料" onclick="forceRefresh()" class="bg-amber-900 text-white rounded-xl px-4 py-2 text-sm font-bold">重新載入資料</button>
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
      if((state.searchQuery || state.selectedCountryObj?.tabs) && state.viewMode !== 'hotels') el.insertAdjacentHTML('afterbegin',getFiltersHTML());
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
  
