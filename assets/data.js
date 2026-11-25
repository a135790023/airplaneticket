    let activeSync = null;
    const SOURCE_NAMES = {flights:'清艙', tours:'旅行團', hotels:'飯店推薦'};
    const CACHE_KEY = 'eddie_sources_v27';
    const FRESH_MS = 60000;
    function sourceFresh(name) { const source=state.sources[name]; return !!source?.data && !source.error && Date.now()-source.syncedAt < FRESH_MS; }
    async function fetchGviz(sheetName) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const url = `https://docs.google.com/spreadsheets/d/11K6w4hIwjTdUz1nJo4nt6i0GMC7QujZD8Mky4yy0zZ8/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
        const response = await fetch(url, {signal:controller.signal, cache:'no-store'});
        if (!response.ok) throw new Error(`Sheet HTTP ${response.status}`);
        const text = await response.text();
        const result = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}')+1));
        if(result.status === 'error' || !Array.isArray(result.table?.rows)) throw new Error('Invalid sheet response');
        return result;
      } finally { clearTimeout(timeout); }
    }
    function fetchSheetData(force = false) {
      if(activeSync) return activeSync;
      activeSync = refreshSources(force).finally(() => {activeSync=null;});
      return activeSync;
    }
    async function refreshSources(force) {
      const previousContent = JSON.stringify([state.tickets.map(t=>[t.id,t.version,t.isWarning]),state.hotels,state.loadError]);
      state.loadError = false;
      if(!Object.keys(state.sources).length) {
        try {
          const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
          if(cached?.schema === 1) for(const name of Object.keys(SOURCE_NAMES)) {
            const source=cached.sources?.[name];
            if(Array.isArray(source?.data?.table?.rows) && Number.isFinite(source.syncedAt) && source.syncedAt <= Date.now()) state.sources[name]=source;
          }
        } catch (_) { /* An unavailable or corrupt cache must not block live data. */ }
      }
      state.isLoading = !Object.values(state.sources).some(s => s.data);
      if(!state.isLoading && !state.tickets.length && !state.hotels.length) {
        try { rebuildData();renderMain(); }
        catch (_) { state.sources={};state.tickets=[];state.hotels=[];state.isLoading=true; }
      }
      if(state.isLoading) renderMain();
      try {
        const names=Object.keys(SOURCE_NAMES).filter(name => force || !sourceFresh(name));
        const results=await Promise.allSettled(names.map(name => fetchGviz(SOURCE_NAMES[name])));
        results.forEach((result,index) => {
          const name=names[index];
          state.sources[name] = result.status === 'fulfilled'
            ? {data:result.value,syncedAt:Date.now(),error:false}
            : {...state.sources[name],error:true};
        });
        state.loadError = Object.values(state.sources).some(s=>s.error);
        rebuildData();
        try { localStorage.setItem(CACHE_KEY,JSON.stringify({schema:1,sources:state.sources})); } catch (_) {}
      } catch (error) {
        state.loadError = true;
        console.error('Data processing failed:',error);
      } finally {
        const scrollY = window.scrollY || 0;
        const focusId=document.activeElement?.id;
        const filterKey=document.activeElement?.dataset?.filter;
        state.isLoading = false;
        state.animateTransition = false;
        const nextContent=JSON.stringify([state.tickets.map(t=>[t.id,t.version,t.isWarning]),state.hotels,state.loadError]);
        if(previousContent !== nextContent || !state.tickets.length && !state.hotels.length) renderMain();
        reconcileModal();
        if(state.pendingOffer) { const id=state.pendingOffer; state.pendingOffer=''; showOffer(id,'shared_link',false); }
        window.scrollTo({top:scrollY,behavior:'instant'});
        if(!state.isModalOpen) {
          if(focusId) document.getElementById(focusId)?.focus?.({preventScroll:true});
          else if(filterKey) document.querySelector(`[data-filter="${filterKey}"]`)?.focus({preventScroll:true});
        }
      }
    }
    window.forceRefresh = () => { window.trackEvent('force_refresh',{}); return fetchSheetData(true); };


    function rebuildData() {
        const flightsData=state.sources.flights?.data, toursData=state.sources.tours?.data, hotelsData1=state.sources.hotels?.data;
        let data = { tickets: [], tours: [], hotels: [] };
        
        const extractRows = (sourceData) => {
            if (!sourceData || !sourceData.table || !sourceData.table.rows) return [];
            const columns = sourceData.table.cols || [];
            return sourceData.table.rows.map(row => {
                if (!row || !row.c) return {};
                let detailsText = '';
                if (row.c[1] && String(row.c[1].v).length > 10) detailsText = String(row.c[1].v);
                else if (row.c[5]) detailsText = String(row.c[5].v);
                else if (row.c[0]) detailsText = String(row.c[0].v);
                const field = names => {
                  const index = columns.findIndex(c => names.includes(String(c?.label || '').trim()));
                  return index >= 0 ? row.c[index]?.v : undefined;
                };
                return { details: detailsText, departureYear: field(['出發年份','出發年度']),
                  sourceYear: field(['檔期基準年']), origin: field(['出發機場','出發地']),
                  supplier: field(['供應商','廠商']), productId: field(['商品編號','商品ID']),
                  productType: field(['商品類型']), city: field(['目的地','目的城市']), country: field(['目的國家']), bookingDeadline: field(['開票截止日']), saleStatus: field(['銷售狀態']), returnDate: field(['回程日期']) }; 
            }).filter(r => r.details);
        };

        data.tickets = extractRows(flightsData);
        data.tours = extractRows(toursData);
        
        const ticketMap = new Map(); 

        let combinedIndex = 0;
        const processCombinedTickets = (rawArray, isTourFlag) => {
            rawArray.forEach((row) => {
                let rawText = row.details;
                
                rawText = rawText
                    .replace(/台灣虎航/g, '🐯')
                    .replace(/虎航/g, '🐯')
                    .replace(/\[系統連線超時，請手動確認網頁\]/g, '')
                    .replace(/\[自動抓取失敗，請手動確認網頁\]/g, '')
                    .replace(/\[系統自動補充\]/g, '')
                    .trim();
                
                const inferred = inferInfoFromText(rawText);
                const parsedItems = parseRawDetails(rawText, {...row, isTour: isTourFlag});
                
                parsedItems.forEach((item, subIndex) => {
                    let safeRowCity = null; 
                    let finalCity = row.city || item.cityContext || safeRowCity || inferred.city;
                    if (finalCity === '其他航點' || !finalCity) finalCity = getCityFromText(inferred.title) || '其他航點';
                    
                    let finalCountry = row.country || getCountryByCity(finalCity);
                    if (!row.country && (finalCity === '其他航點' || finalCountry === '其他')) {
                        if (rawText.includes('泰國')) { finalCountry = '泰國'; finalCity = '曼谷'; }
                        else if (rawText.includes('韓國')) { finalCountry = '韓國'; finalCity = '首爾'; }
                        else if (rawText.includes('越南')) { finalCountry = '越南'; finalCity = '峴港'; }
                    }
                    if (!KNOWN_COUNTRIES.includes(finalCountry)) finalCountry = '其他';
                    
                    const actualIsTour = item.isTour;
                    let airlineTag = actualIsTour ? '跟團行程' : item.airlineContext;
                    let status = getTicketStatus(item.date, airlineTag || item.titleContext || '', actualIsTour, row);
                    
                    if (status.isHidden) {
                        return;
                    }

                    const ticketObj = { 
                        id: '',
                        source: isTourFlag ? 'tours' : 'flights',
                        bookingDeadline: row.bookingDeadline || '', saleStatus: row.saleStatus || '',
                        ...travelFacts(item, row), 
                        uploadIndex: combinedIndex, 
                        country: finalCountry, 
                        city: finalCity.trim(), 
                        date: item.date, 
                        airline: item.titleContext || inferred.title, 
                        airlineTag: airlineTag, 
                        price: item.price,
                        priceUnit: item.priceUnit,
                        perPersonPrice: item.perPersonPrice, 
                        details: item.blockText || rawText, 
                        isFlightAndHotel: item.isFlightAndHotel, 
                        isBogo: item.isBogo, 
                        isTour: actualIsTour,
                        link: safeHttpUrl(item.link),
                        isHidden: status.isHidden,
                        isWarning: status.isWarning
                    };

                    const key = `${ticketObj.date}_${ticketObj.city}_${productIdentity(item, ticketObj.airline, row)}`;
                    
                    ticketObj.id = 'offer-' + stableHash(key);
                    ticketObj.version = stableHash(JSON.stringify([ticketObj.price,ticketObj.details,ticketObj.bookingDeadline,ticketObj.saleStatus]));
                    ticketMap.set(key, ticketObj);
                });
                combinedIndex++;
            });
        };

        processCombinedTickets(data.tickets, false);
        processCombinedTickets(data.tours, true);
        
        state.tickets = Array.from(ticketMap.values());
        
        const extractHotels = (sourceData) => {
            if (!sourceData || !sourceData.table || !sourceData.table.cols) return [];
            let headers = sourceData.table.cols.map(c => c ? String(c.label || '').trim() : '');
            let rowsToProcess = sourceData.table.rows || [];
            
            if (headers.filter(Boolean).length === 0 && rowsToProcess.length > 0) {
                headers = rowsToProcess[0].c.map(cell => cell ? String(cell.v || '').trim() : '');
                rowsToProcess = rowsToProcess.slice(1);
            }
            
            const approvalIdx = headers.findIndex(h => h === '核准' || h === '審核' || h === '發佈');
            
            return rowsToProcess.filter(row => {
                if (!row || !row.c) return false;
                if (approvalIdx !== -1) {
                    const val = row.c[approvalIdx] ? String(row.c[approvalIdx].v).trim().toUpperCase() : '';
                    if (!['Y', 'V', 'OK', '是'].includes(val)) return false;
                }
                return true;
            }).map((row, i) => {
                let obj = { id: `hotel-${i}` };
                headers.forEach((h, j) => {
                    if (!h || !row.c[j]) return;
                    const v = String(row.c[j].v).trim();
                    if (h.includes('國家')) obj.country = v;
                    if (h.includes('城市')) obj.city = v;
                    if (h.includes('飯店') || h.includes('名稱')) obj.name = v;
                    if (h.includes('心得') || h.includes('說明')) obj.description = v;
                    if (h.includes('連結') || h.includes('網址')) obj.link = v;
                    if (h.includes('署名') || h.includes('暱稱') || h.includes('名字') || h.includes('投稿')) obj.submitter = v;
                });
                return obj;
            }).filter(h => h.name);
        };

        data.hotels = extractHotels(hotelsData1);


        state.hotels = data.hotels.map(h => {
            let rawCountry = (h.country || '').trim();
            let rawCity = (h.city || '').trim();
            let rawName = (h.name || '').trim();
            
            let combinedText = rawCountry + " " + rawCity + " " + rawName;
            let inferredCity = getCityFromText(combinedText) || rawCity;
            let inferredCountry = getCountryByCity(inferredCity);
            
            if (KNOWN_COUNTRIES.includes(inferredCountry) && inferredCountry !== '其他') {
                rawCountry = inferredCountry;
            }
            if (!KNOWN_COUNTRIES.includes(rawCountry)) {
                rawCountry = '其他';
            }

            return { 
                ...h,
                country: rawCountry, 
                city: rawCity || inferredCity || '未提供城市', 
                normalizedCity: inferredCity
            };
        }).reverse(); 
        
        state.lastSync = Math.min(...Object.values(state.sources).filter(s=>s.data).map(s=>s.syncedAt));

    }
