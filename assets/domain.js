    const LINE_OFFICIAL_ID = '@616fwicf'; 

    // 無年份的既有貼文屬於已確認的 2026–2027 檔期，不隨訪客時鐘每年往後滾動。
    // 新檔期請在廠商原文明寫 YYYY/MM/DD，或提供「出發年份」欄位。
    const LEGACY_SCHEDULE_YEAR = 2026;

    function escapeHTML(value) {
      return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
    }

    function safeHttpUrl(value) {
      try {
        const url = new URL(String(value || '').trim());
        return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
      } catch (_) { return ''; }
    }

    // JSON 負責 JavaScript 字串邊界，HTML escaping 負責 attribute 邊界。
    function eventParams(params) { return escapeHTML(JSON.stringify(params)); }

    function taipeiToday() {
      const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Taipei', year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(new Date());
      const get = type => parts.find(p => p.type === type).value;
      return `${get('year')}-${get('month')}-${get('day')}`;
    }

    function validISODate(y, m, d) {
      const date = new Date(Date.UTC(y, m - 1, d));
      return y >= 2000 && y <= 2100 && date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
        ? `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}` : null;
    }

    function scheduleContext(text, metadata = {}) {
      text = text.normalize('NFKC');
      const explicitYear = Number(metadata.departureYear) || Number(text.match(/(?:出發年份|出發年度|出發年)\s*[:：]?\s*(20\d{2})/)?.[1]);
      const baseYear = Number(metadata.sourceYear) || LEGACY_SCHEDULE_YEAR;
      const dateText = text.split('\n').filter(line => !/https?:\/\/|開幕|翻新|リニューアル|更新日期/.test(line)).join('\n');
      const months = [...dateText.matchAll(/(?<![\d/])(?<!\d:)(\d{1,2})\/(\d{1,2})(?![\d:])/g)]
        .filter(m => validISODate(2000, Number(m[1]), Number(m[2]))).map(m => Number(m[1]));
      // 明確完整日期可為同一行的省略年份日期提供基準；冬春資料可延伸至六月。
      const fullDates = [...dateText.matchAll(/\b(20\d{2})[/-](\d{1,2})[/-](\d{1,2})\b/g)];
      const winterSpring = months.some(m => m <= 3);
      const earlyLimit = winterSpring ? (months.every(m => m <= 6) ? 6 : Math.max(3, ...months.filter(m => m <= 4))) : 0;
      const tripCode = text.match(/https:\/\/agent\.bbctour\.com\.tw\/tour\/[^\s]*\/\w{3}\d{2}(2\d)(\d{2})(\d{2})[A-Z]/i);
      const codeYear = tripCode && validISODate(2000 + Number(tripCode[1]), Number(tripCode[2]), Number(tripCode[3])) ? 2000 + Number(tripCode[1]) : null;
      const yearHeading = text.split('\n').slice(0,3).join(' ').match(/\b(20\d{2})\s*(?:年|第一趟|春|夏|冬|秋|新年)/)?.[1];
      return {baseYear, explicitYear: explicitYear || codeYear || Number(yearHeading) || null, earlyLimit,
        anchor: fullDates.length ? {year:Number(fullDates[0][1]), month:Number(fullDates[0][2])} : null};
    }

    function extractDepartureDates(text, context) {
      if (text?.includes('\n')) return [...new Set(text.split('\n').flatMap(line => extractDepartureDates(line, context)))];
      if (!text || /開幕|翻新|リニューアル/.test(text)) return [];
      if (/回程|回航|返程/.test(text) && !/出發日/.test(text)) return [];
      if (/更新日期|截止|開票期限/.test(text) && !/出發日/.test(text)) return [];
      text = text.normalize('NFKC').replace(/https?:\/\/[^\s]+/g, '');
      const result = [];
      const pattern = /(?<![\d/])(?<!\d:)(?:(20\d{2})[/-])?(\d{1,2})[/-](\d{1,2})(?![\d:]|\s*[:月號])/g;
      const inferYear = m => {
        if (context.explicitYear) return context.explicitYear;
        if (context.anchor) {
          if (context.earlyLimit && context.anchor.month >= 7 && m <= context.earlyLimit) return context.anchor.year + 1;
          if (context.earlyLimit && context.anchor.month <= 6 && m >= 7) return context.anchor.year - 1;
          return context.anchor.year;
        }
        return context.baseYear + (m <= context.earlyLimit ? 1 : 0);
      };
      for (const match of text.matchAll(pattern)) {
        const m = Number(match[2]), d = Number(match[3]), y = Number(match[1]) || inferYear(m);
        const date = validISODate(y,m,d);
        if (!date) continue;
        result.push(date);
        let tail = text.slice(match.index + match[0].length);
        let shorthand;
        while ((shorthand = tail.match(/^[、，,]\s*(\d{1,2})(?![\d/:-])/))) {
          const shortDate = validISODate(y,m,Number(shorthand[1]));
          if (shortDate) result.push(shortDate);
          tail = tail.slice(shorthand[0].length);
        }
      }
      return [...new Set(result)];
    }

    const OTHER_DESTINATIONS = [
      ['美國', /美國|美西|美東|洛杉磯|舊金山|拉斯維加斯/], ['加拿大', /加拿大/],
      ['瑞士', /瑞士|少女峰|馬特宏峰/], ['冰島', /冰島/], ['義大利', /義大利|羅馬|威尼斯/],
      ['希臘', /希臘|聖托里尼/], ['北歐', /北歐|挪威|丹麥|瑞典|芬蘭/],
      ['西班牙／葡萄牙', /西葡/], ['葡萄牙', /葡萄牙|里斯本/], ['西班牙', /西班牙|巴塞隆納/],
      ['埃及', /埃及|尼羅河|金字塔/], ['摩洛哥', /摩洛哥/], ['土耳其', /土耳其/],
      ['中國', /新疆|北疆|南疆|中國|上海|北京/], ['澳洲', /澳洲|雪梨|墨爾本/], ['紐西蘭', /紐西蘭/]
    ];

    function inferProductType(text, fallback = false, explicitType = '') {
      const marker = (`商品類型：${explicitType}\n` + text).match(/商品類型\s*[:：]\s*(純機票|機票|機加酒|機酒|旅行團|跟團行程|跟團)/);
      if (marker) return /旅行團|跟團/.test(marker[1]);
      if (fallback) return true;
      return /團費|已成團|已成行|全(?:部|梯次).*成行|跟團|旅行團|(?:行程\s*[:：👉]?\s*https?:\/\/)/.test(text);
    }

    function normalizeDays(text) {
      const numbers = {'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10,'十一':11,'十二':12,'十三':13,'十四':14,'十五':15};
      return String(text || '').normalize('NFKC').replace(/([一二三四五六七八九十]+)(?=\s*[日天])/g, (s,n) => numbers[n] || s);
    }

    function productIdentity(item, title, metadata = {}) {
      const text = item.blockText || '';
      const flightCode = line => [...line.toUpperCase().matchAll(/\b([A-Z][A-Z0-9]|[0-9][A-Z])\s*(\d{2,4})\b/g)]
        .map(m => m[1] + Number(m[2])).join('+');
      const out = text.split('\n').find(l => /去程|往程/.test(l)) || '';
      const back = text.split('\n').find(l => /回程|返程/.test(l)) || '';
      const origin = String(metadata.origin || out.match(/桃園|高雄|台中|臺中|松山|台南|臺南|台北|臺北/)?.[0] || title.match(/桃園|高雄|台中|臺中|松山|台南|臺南|台北|臺北/)?.[0] || '').replace(/臺/g,'台');
      const duration = normalizeDays(title).match(/\d+(?:\s*[+＋]\s*\d+)?\s*(?:日|天)/)?.[0]?.replace(/\s/g,'').replace(/天/g,'日') || '';
      const titleKey = normalizeForDedup(normalizeDays(title));
      const supplier = String(metadata.supplier || '');
      const explicitID = metadata.productId || text.match(/(?:商品編號|團號)\s*[:：]\s*([A-Z0-9_-]+)/i)?.[1];
      // 資訊不足時保守保留不同原文，避免把無法辨識的商品合併。
      const fallback = origin && duration && flightCode(out) && flightCode(back) ? '' : normalizeForDedup(text);
      const identity = explicitID ? [supplier, explicitID] : item.isTour
        ? [supplier, titleKey, safeHttpUrl(item.link), origin, duration, flightCode(out), flightCode(back)]
        : [supplier, origin, duration, flightCode(out), flightCode(back), item.packageContext || '', fallback];
      return JSON.stringify([identity, item.isFlightAndHotel, item.isBogo, item.isTour]);
    }

    const LOCATION_DATA = [
      { country: '日本', slug: 'japan', image: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=800&q=80', tabs: [{ label: '關東', slug: 'kanto', cities: ['東京', '茨城'] }, { label: '關西', slug: 'kansai', cities: ['大阪', '神戶', '京都'] }, { label: '北海道', slug: 'hokkaido', cities: ['北海道', '札幌', '函館', '旭川', '帶廣', '釧路', '女滿別'] }, { label: '東北', slug: 'tohoku', cities: ['仙台', '花卷', '秋田', '青森', '山形', '福島'] }, { label: '九州·四國', slug: 'kyushu-shikoku', cities: ['福岡', '高松', '熊本', '高知', '佐賀', '長崎', '宮崎', '鹿兒島', '松山', '大分', '北九州'] }, { label: '中部·北陸', slug: 'chubu-hokuriku', cities: ['名古屋', '新潟', '靜岡', '小松', '富山'] }, { label: '沖繩', slug: 'okinawa', cities: ['沖繩', '石垣島', '宮古島'] }] },
      { country: '韓國', slug: 'korea', image: 'https://images.unsplash.com/photo-1546874177-9e664107314e?auto=format&fit=crop&w=800&q=80', tabs: [{ label: '首爾', slug: 'seoul', cities: ['首爾'] }, { label: '釜山', slug: 'busan', cities: ['釜山'] }, { label: '濟州島', slug: 'jeju', cities: ['濟州島'] }] },
      { country: '泰國', slug: 'thailand', image: 'https://images.unsplash.com/photo-1552465011-b4e21bf6e79a?auto=format&fit=crop&w=800&q=80', tabs: [{ label: '曼谷', slug: 'bangkok', cities: ['曼谷'] }, { label: '清邁', slug: 'chiangmai', cities: ['清邁'] }, { label: '普吉島', slug: 'phuket', cities: ['普吉島'] }] },
      { country: '越南', slug: 'vietnam', image: 'https://images.unsplash.com/photo-1528127269322-539801943592?auto=format&fit=crop&w=800&q=80', tabs: [{ label: '峴港', slug: 'danang', cities: ['峴港'] }, { label: '胡志明市', slug: 'hcmc', cities: ['胡志明市'] }, { label: '河內', slug: 'hanoi', cities: ['河內'] }, { label: '富國島', slug: 'phuquoc', cities: ['富國島'] }] },
      { country: '其他', slug: 'others', image: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=800&q=80', tabs: [{ label: '其他航點', slug: 'misc', cities: ['其他航點', '新加坡', '吉隆坡', '澳門', '香港', '馬尼拉', '宿霧', '長灘島', '峇里島'] }] }
    ];

    const KNOWN_COUNTRIES = LOCATION_DATA.filter(loc => loc.country !== '其他').map(loc => loc.country);
    
    const CITY_ALIASES = [
      { standard: '首爾', aliases: ['首爾', '仁川', '金浦', 'ICN', 'GMP'] }, 
      { standard: '釜山', aliases: ['釜山', '金海', 'PUS'] }, 
      { standard: '濟州島', aliases: ['濟州島', '濟州', 'CJU'] }, 
      { standard: '東京', aliases: ['東京', '成田', '羽田', 'NRT', 'HND', '關東', '千葉', '舞濱', '橫濱', '神奈川', '箱根', '河口湖', '富士', '輕井澤', '埼玉', '日光'] }, 
      { standard: '茨城', aliases: ['茨城', 'IBR'] }, 
      { standard: '大阪', aliases: ['大阪', '關西', '關空', 'KIX', '伊丹', 'ITM', '京阪神'] }, 
      { standard: '神戶', aliases: ['神戶', 'UKB'] }, 
      { standard: '京都', aliases: ['京都', '宇治'] }, 
      { standard: '北海道', aliases: ['北海道', '道央', '道東', '道南', '道北', '富良野', '美瑛', '小樽'] }, 
      { standard: '札幌', aliases: ['札幌', '新千歲', '千歲', 'CTS'] }, 
      { standard: '函館', aliases: ['函館', 'HKD'] }, 
      { standard: '旭川', aliases: ['旭川', 'AKJ'] }, 
      { standard: '帶廣', aliases: ['帶廣', 'OBO'] }, 
      { standard: '釧路', aliases: ['釧路', 'KUH'] }, 
      { standard: '女滿別', aliases: ['女滿別', 'MMB'] }, 
      { standard: '仙台', aliases: ['仙台', 'SDJ', '東北'] }, 
      { standard: '花卷', aliases: ['花卷', 'HNA'] }, 
      { standard: '新潟', aliases: ['新潟', 'KIJ'] }, 
      { standard: '秋田', aliases: ['秋田', 'AXT'] }, 
      { standard: '青森', aliases: ['青森', 'AOJ'] }, 
      { standard: '山形', aliases: ['山形', 'GAJ'] }, 
      { standard: '福島', aliases: ['福島', 'FKS'] }, 
      { standard: '福岡', aliases: ['福岡', 'FUK', '九州'] }, 
      { standard: '熊本', aliases: ['熊本', 'KMJ', '阿蘇熊本'] }, 
      { standard: '高松', aliases: ['高松', 'TAK', '四國'] }, 
      { standard: '佐賀', aliases: ['佐賀', 'HSG'] }, 
      { standard: '長崎', aliases: ['長崎', 'NGS'] }, 
      { standard: '宮崎', aliases: ['宮崎', 'KMI'] }, 
      { standard: '鹿兒島', aliases: ['鹿兒島', 'KOJ'] }, 
      { standard: '松山', aliases: ['松山', 'MYJ'] }, 
      { standard: '大分', aliases: ['大分', 'OIT'] }, 
      { standard: '北九州', aliases: ['北九州', 'KKJ'] }, 
      { standard: '名古屋', aliases: ['名古屋', '中部國際', 'NGO', '北陸', '黑部立山', '立山黑部', '合掌村'] }, 
      { standard: '靜岡', aliases: ['靜岡', 'FSZ'] }, 
      { standard: '小松', aliases: ['小松', 'KMQ'] }, 
      { standard: '富山', aliases: ['富山', 'TOY'] }, 
      { standard: '沖繩', aliases: ['沖繩', '那霸', '琉球', 'OKA'] }, 
      { standard: '石垣島', aliases: ['石垣島', 'ISG'] }, 
      { standard: '宮古島', aliases: ['宮古島', 'MMY'] }, 
      { standard: '曼谷', aliases: ['曼谷', '蘇凡納布', 'BKK', '廊曼', 'DMK'] }, 
      { standard: '清邁', aliases: ['清邁', 'CNX'] }, 
      { standard: '普吉島', aliases: ['普吉島', 'HKT'] }, 
      { standard: '胡志明市', aliases: ['胡志明', '新山一', 'SGN'] }, 
      { standard: '河內', aliases: ['河內', '內排', 'HAN', '北越', '沙壩'] }, 
      { standard: '峴港', aliases: ['峴港', 'DAD'] }, 
      { standard: '富國島', aliases: ['富國島', 'PQC'] }, 
      { standard: '新加坡', aliases: ['新加坡', 'SIN'] }, 
      { standard: '吉隆坡', aliases: ['吉隆坡', 'KUL'] }, 
      { standard: '澳門', aliases: ['澳門', 'MFM'] }, 
      { standard: '香港', aliases: ['香港', 'HKG'] }, 
      { standard: '馬尼拉', aliases: ['馬尼拉', 'MNL'] }, 
      { standard: '宿霧', aliases: ['宿霧', 'CEB'] }, 
      { standard: '長灘島', aliases: ['長灘島'] }, 
      { standard: '峇里島', aliases: ['峇里島', 'DPS'] }
    ];

    const FLIGHT_MAPPINGS = [
      { city: '清邁', codes: ['FD242', 'FD243', 'FD244', 'FD245', 'VZ822', 'VZ823', 'JX751', 'JX752'] },
      { city: '曼谷', codes: ['VZ562', 'VZ563', 'VZ564', 'VZ565', 'SL398', 'SL399', 'FD230', 'FD231', 'IT505', 'IT506'] },
      { city: '東京', codes: ['IT200', 'IT201', 'IT202', 'IT203', 'MM620', 'MM621', 'MM622', 'MM623', 'MM624', 'MM625', 'GK11', 'GK12', 'TR898', 'TR899', 'JX800', 'JX801', 'CI100', 'CI101', 'BR198', 'BR197'] },
      { city: '大阪', codes: ['IT210', 'IT211', 'IT212', 'IT213', 'MM22', 'MM23', 'MM28', 'MM29', 'MM36', 'MM37', 'JX820', 'JX821'] },
      { city: '沖繩', codes: ['IT230', 'IT231', 'MM923', 'MM924', 'MM927', 'MM928'] },
      { city: '福岡', codes: ['IT240', 'IT241', 'JX840', 'JX841'] },
      { city: '北海道', codes: ['IT234', 'IT235', 'TR892', 'TR893', 'JX830', 'JX831'] },
      { city: '仙台', codes: ['IT254', 'IT255', 'JX862', 'JX863'] },
      { city: '峴港', codes: ['IT551', 'IT552', 'JX701', 'JX702'] },
      { city: '富國島', codes: ['VJ844', 'VJ845', 'IT543', 'IT544', 'JX705', 'JX706'] },
      { city: '釜山', codes: ['BX793', 'BX794', 'BX795', 'BX796', 'IT606', 'IT607'] },
      { city: '濟州島', codes: ['IT654', 'IT655', 'TW687', 'TW688'] },
      { city: '澳門', codes: ['IT301', 'IT302', 'JX201', 'JX202', 'JX203', 'JX204'] }
    ];





    function getCityFromText(text) {
      if (!text) return null;
      text = text.replace(/https?:\/\/[^\s]+/g, '');
      const foreignDestination = OTHER_DESTINATIONS.map(([city, pattern]) => ({city, index:text.search(pattern)}))
        .filter(match => match.index >= 0).sort((a,b) => a.index-b.index)[0];
      let earliestIndex = -1, foundCity = null;
      const checkMatch = (city, matchStr) => {
        let idx = text.indexOf(matchStr);
        if (idx !== -1) {
            if (matchStr === '金海' && text.includes('黃金海岸')) return;
            if (matchStr === '大分' && text.includes('大部分')) return;

            if (earliestIndex === -1 || idx < earliestIndex) { 
                earliestIndex = idx; 
                foundCity = city; 
            }
        }
      };
      for (let mapping of CITY_ALIASES) { for (let alias of mapping.aliases) { checkMatch(mapping.standard, alias); } }
      for (let loc of LOCATION_DATA) { for (let tab of loc.tabs) { for (let c of tab.cities) { checkMatch(c, c); } } }
      if (foreignDestination && (earliestIndex < 0 || foreignDestination.index < earliestIndex)) return foreignDestination.city;
      if (!foundCity) {
        const normalizedText = text.toUpperCase().replace(/\s+/g, '');
        for (let mapping of FLIGHT_MAPPINGS) {
          for (let code of mapping.codes) {
            if (normalizedText.includes(code)) return mapping.city;
          }
        }
      }
      return foundCity;
    }

    function getCountryByCity(cityName) {
      if (!cityName) return '其他';
      const cleanCity = cityName.trim();
      for (let loc of LOCATION_DATA) { for (let tab of loc.tabs) { if (tab.cities.includes(cleanCity)) return loc.country; } }
      return '其他';
    }

    const normalizeForDedup = (str) => {
      if (!str) return '';
      try { return str.replace(/[\s\p{P}\p{Extended_Pictographic}❗️🔥✨⭐⚡️]/gu, '').replace(/更新|降價|再降|大降價|清艙|促銷|最後機會|最新|快訊/g, '').toLowerCase(); }
      catch(e) { return str.replace(/[\s.,/#!$%^&*;:{}=\-_`~()[\]【】❗️🔥✨⭐⚡️]/g, '').replace(/更新|降價|再降|大降價|清艙|促銷|最後機會|最新|快訊/g, '').toLowerCase(); }
    };

    function inferInfoFromText(text) {
      let title = '未命名行程', country = '其他', city = '其他航點';
      if (!text) return { title, country, city };
      const lines = text.split('\n').map(l => l.trim()).filter(l => l !== '');
      let inferredCity = getCityFromText(text);
      if (inferredCity) { city = inferredCity; country = getCountryByCity(city); }
      else { for (let loc of LOCATION_DATA) { if (text.includes(loc.country)) { country = loc.country; break; } } }
      let bestTitle = lines.find(line => /\d+(?:\s*[+＋]\s*\d+)?\s*(?:日|天)/.test(normalizeDays(line)) && getCityFromText(line) && !/[$＄]|出發日|去程|回程/.test(line)) || '';
      for (let line of (bestTitle ? [] : lines)) {
        const fluffRegex = /^[\p{Extended_Pictographic}\s❗️🔥✨⭐⚡️👉更新降價再降大降價清艙促銷最後機會預估最新快訊]+$/u;
        if (fluffRegex.test(line)) continue;
        const cleanLine = line.replace(/^[\p{Extended_Pictographic}\s❗️🔥✨⭐⚡️👉【】\[\]()\-]+/gu, '').trim();
        if (cleanLine.length >= 2 && !cleanLine.startsWith('更新') && !cleanLine.startsWith('降價')) {
            bestTitle = cleanLine;
            break;
        }
      }
      if (bestTitle) {
          bestTitle = bestTitle.replace(/^(?:202[4-9][\/\-])?\d{1,2}[\/\-]\d{1,2}\s*/, '').trim();
          title = bestTitle;
      }
      return { title, country, city };
    }

    function inferAirlineFromCode(text) {
      if (!text) return '';
      const normalized = text.toUpperCase().replace(/\s+/g, '');
      const codes = {
        'IT': '台灣虎航', 'TR': '酷航', 'MM': '樂桃', 'JX': '星宇', 'BR': '長榮', 'CI': '華航',
        'VZ': '泰越捷', 'FD': '泰亞航', 'SL': '泰獅航', 'GK': '捷星', 'BX': '釜山航空',
        'TW': '德威', 'VJ': '越捷', '7C': '濟州航空', 'ZE': '易斯達', 'LJ': '真航空',
        'UO': '香港快運', 'HB': '大灣區', 'CX': '國泰', 'NX': '澳門航空', 'OD': '峇迪',
        'AK': '亞航', 'D7': '全亞航', 'MH': '馬航', 'SQ': '新航', 'PR': '菲律賓航空', '5J': '宿霧太平洋'
      };
      for (let code in codes) {
        const regex = new RegExp(code + '\\d{2,4}');
        if (regex.test(normalized)) return codes[code];
      }
      const names = ['酷航', '虎航', '台灣虎航', '星宇', '長榮', '華航', '中華航空', '越捷', '泰越捷', '樂桃', '捷星', '國泰', '釜山航空', '德威', '濟州航空', '真航空', '大灣區', '澳門航空', '泰亞航', '全亞航', '亞洲航空', '亞航'].sort((a, b) => b.length - a.length);
      for (let name of names) {
        if (text.includes(name)) return name.replace('虎航', '台灣虎航').replace('台灣台灣虎航', '台灣虎航').replace('中華航空', '華航').replace('亞洲航空', '亞航');
      }
      return '';
    }

    function getTicketStatus(dateStr, airline, isTour = false, metadata = {}) {
      if (/停售|下架|sold.?out/i.test(metadata.saleStatus || '')) return {isHidden:true,isWarning:false,reason:'withdrawn'};
      if (!dateStr) return { isHidden: true, isWarning: true, reason: 'needs_review' };
      const parts = dateStr.split('-');
      if (parts.length !== 3 || !validISODate(...parts.map(Number))) return { isHidden: true, isWarning: false, reason: 'invalid_date' };
      
      const depDate = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
      const today = new Date(taipeiToday() + 'T00:00:00Z');

      if (depDate < today) return {isHidden:true,isWarning:false,reason:'expired'};
      if (depDate.getTime() === today.getTime()) return {isHidden:true,isWarning:false,reason:'departure_day'};
      const deadline = String(metadata.bookingDeadline || '').replaceAll('/', '-');
      if (/^\d{4}-\d{2}-\d{2}$/.test(deadline) && validISODate(...deadline.split('-').map(Number)) && taipeiToday() > deadline) return {isHidden:true,isWarning:false,reason:'booking_closed'};

      let workingDaysLeft = 0;
      let cur = new Date(today);
      while (cur < depDate) {
          cur.setUTCDate(cur.getUTCDate() + 1);
          if (cur.getUTCDay() !== 0 && cur.getUTCDay() !== 6) {
              workingDaysLeft++;
          }
      }

      let isHidden = false;
      let isWarning = false;

      if (isTour) {
          if (workingDaysLeft < 1) {
              isHidden = true;
          } else if (workingDaysLeft <= 5) {
              isWarning = true;
          }
      } else {
          const isPeach = airline && (airline.includes('樂桃') || airline.toUpperCase().includes('MM'));
          const isScoot = airline && (airline.includes('酷航') || airline.toUpperCase().includes('TR'));

          if (isPeach) {
              if (workingDaysLeft <= 7) isHidden = true;
          } else if (isScoot) {
              if (workingDaysLeft < 2) {
                  isHidden = true;
              } else if (workingDaysLeft === 2) {
                  isWarning = true;
              }
          } else {
              if (workingDaysLeft < 4) {
                  isHidden = true;
              } else if (workingDaysLeft === 4 || workingDaysLeft === 5) {
                  isWarning = true;
              }
          }
      }

      return { isHidden, isWarning: isWarning || metadata.saleStatus === '需確認', reason: isHidden ? 'booking_cutoff' : isWarning || metadata.saleStatus === '需確認' ? 'needs_confirmation' : 'available' };
    }

    function parseRawDetails(details, metadata = {}) {
      const isGlobalTour = inferProductType(details || '', metadata.isTour, metadata.productType);

      if (!details) return [];
      
      const items = [];
      const dateContext = scheduleContext(details, metadata);
      const extractDates = text => extractDepartureDates(text, dateContext);

      const priceRegexes = [
        /(?:NT\$|\$|＄|💵|💰|現金價|售價|價格|優惠價|促銷價|機票|含稅|未稅|TWD|NTD|只要)[:：\s\-\$＄]*([0-9,]{3,})/i,
        /([0-9]{1,2},[0-9]{3}|[1-9][0-9]{3,})[\s]*(?:起|元)/
      ];

      let blocks = details.split(/\n\s*[-=_]{3,}\s*\n?/);
      const getPackageType = (text) => {
        if (/純\s*(?:機票|票)|單\s*(?:機票|票)/.test(text)) return false;
        if (/(?:不含|未含)(?:飯店|住宿|機票)/.test(text)) return false;
        if (/(?:加購|另購).*(?:機\s*(?:[+＋]|加)\s*酒|機酒)/.test(text)) return null;
        if (/機\s*(?:[+＋]|加)\s*酒|機酒|機票\s*[+＋]\s*(?:飯店|住宿)/.test(text)) return true;
        return null;
      };
      const isProductHeading = (line) => {
        if (!getCityFromText(line) || /https?:\/\/|去程|回程|出發日|參考航班|托運/.test(line)) return false;
        return /\d+(?:\s*[+＋]\s*\d+)?\s*(?:日|天)/.test(normalizeDays(line)) ||
          (!/[$＄]|\d{1,2}:\d{2}/.test(line) && !!inferAirlineFromCode(line));
      };
      const hasPrice = (line) => priceRegexes.some(rx => rx.test(line)) || /(?:→|->|=>).*\d[\d,]{3,}/.test(line);
      // 一格內未用分隔線隔開的多個商品，也各自保留航班／出發地上下文。
      blocks = blocks.flatMap(block => {
        const sections = [], lines = [];
        let priced = false;
        for (const line of block.split('\n')) {
          if (priced && isProductHeading(line) && !hasPrice(line)) {
            sections.push(lines.splice(0).join('\n'));
            priced = false;
          }
          lines.push(line);
          if (hasPrice(line)) priced = true;
        }
        if (lines.length) sections.push(lines.join('\n'));
        return sections;
      });
      const firstHeader = [];
      for (const line of (blocks.find(block => block.trim()) || '').split('\n')) {
        if (hasPrice(line) || extractDates(line).length) break;
        firstHeader.push(line);
      }
      // 只有同一商品的共同標題可供飯店方案沿用；不同商品段落各自判斷。
      const sharedPackage = firstHeader.some(line => getPackageType(line) === true) &&
        !firstHeader.some(line => getPackageType(line) === false) &&
        !blocks.slice(1).some(block => block.split('\n').some(isProductHeading));
      const getSingleAirline = (text) => {
        const airlines = new Set(text.split('\n').map(inferAirlineFromCode).filter(Boolean));
        if (airlines.has('亞航') && (airlines.has('泰亞航') !== airlines.has('全亞航'))) airlines.delete('亞航');
        return airlines.size === 1 ? [...airlines][0] : '';
      };
      const sharedAirline = getSingleAirline(details);
      let footerText = '';
      
      if (blocks.length > 1) {
          const lastBlock = blocks[blocks.length - 1];
          if (extractDates(lastBlock).length === 0) {
              footerText = '\n\n' + lastBlock.trim();
          }
      }

      let currentCityContext = null;
      let currentTitleContext = null;

      for (let block of blocks) {
        if (!block.trim()) continue;
        if (block === blocks[blocks.length - 1] && extractDates(block).length === 0 && blocks.length > 1) continue; 

        let blockGlobalLinkMatch = block.match(/(https?:\/\/[^\s]+)/);
        let blockGlobalLink = blockGlobalLinkMatch ? blockGlobalLinkMatch[0] : null;

        const lines = block.split('\n');
        const blockAirline = getSingleAirline(block);
        let packageSection = sharedPackage;
        let blockRunningPackage = packageSection;
        let initialPackageSection = packageSection;
        
        let allDatesInBlock = [];
        for (let line of lines) allDatesInBlock.push(...extractDates(line));
        let blockEarliestDate = null;
        if (allDatesInBlock.length > 0) {
            allDatesInBlock.sort();
            let eParts = allDatesInBlock[0].split('-');
            blockEarliestDate = new Date(parseInt(eParts[0], 10), parseInt(eParts[1], 10) - 1, parseInt(eParts[2], 10));
        }
        let daysMatch = block.match(/(\d+)\s*(?:日|天)/);
        let blockDays = daysMatch ? parseInt(daysMatch[1], 10) : null;

        let blockCityContext = getCityFromText(block);
        currentCityContext = blockCityContext;
        const blockTitle = block.split('\n').find(isProductHeading);
        currentTitleContext = blockTitle?.trim() || currentTitleContext || inferInfoFromText(details).title;
        let blockRunningPrice = null;
        let blockRunningBogo = false;
        let pendingBogo = false;
        let bogoLookaheadPriceIndex = -1;

        for (let line of lines) {
            if (line.includes('買一送一')) blockRunningBogo = true;
            let pm = null;
            if (line.includes('→') || line.includes('->') || line.includes('=>')) {
                const parts = line.split(/→|->|=>/);
                pm = parts[parts.length - 1].match(/([0-9,]{4,})/);
            }
            if (!pm) { for (let rx of priceRegexes) { pm = line.match(rx); if (pm) break; } }
            const packageType = getPackageType(line);
            if (isProductHeading(line)) initialPackageSection = packageType ?? false;
            if (packageType !== null && !pm) initialPackageSection = packageType;
            if (pm) {
                blockRunningPrice = pm[1].replace(/,/g, '');
                blockRunningPackage = packageType ?? initialPackageSection;
                break;
            }
        }

        for (let i = 0; i < lines.length; i++) {
          let line = lines[i];
          const lineHasBogo = line.includes('買一送一');
          let foundCityInLine = getCityFromText(line);
          if (foundCityInLine && isProductHeading(line)) {
              currentCityContext = foundCityInLine;
              let cleanLine = line.replace(/^[\p{Extended_Pictographic}\s❗️🔥✨⭐⚡️👉【】\[\]()]+|[\p{Extended_Pictographic}\s❗️🔥✨⭐⚡️]+$/gu, '').replace(/^(更新|降價|再調|大降價|清艙|促銷|最後機會|最新|快訊)\s*/gi, '').trim();
              cleanLine = cleanLine.replace(/^(?:202[4-9][\/\-])?\d{1,2}[\/\-]\d{1,2}\s*/, '');
              if (cleanLine.length > 2) currentTitleContext = cleanLine;
          }
          const linePackageType = getPackageType(line);
          
          let priceMatch = null;
          if (line.includes('→') || line.includes('->') || line.includes('=>')) {
              const parts = line.split(/→|->|=>/);
              priceMatch = parts[parts.length - 1].match(/([0-9,]{4,})/);
          }
          if (!priceMatch) {
              for (let rx of priceRegexes) { priceMatch = line.match(rx); if (priceMatch) break; }
          }
          if (isProductHeading(line)) packageSection = !priceMatch ? (linePackageType ?? false) : false;
          if (linePackageType !== null && !priceMatch) {
              packageSection = linePackageType;
              blockRunningPackage = linePackageType;
          }
          if (priceMatch) blockRunningPackage = linePackageType ?? packageSection;
          let lineIsPak = blockRunningPackage;
          // 促銷只屬於對應價格組；新的普通票價不能沿用上一組的標籤。
          if (priceMatch) {
              blockRunningPrice = priceMatch[1].replace(/,/g, '');
              blockRunningBogo = lineHasBogo || pendingBogo || (i === bogoLookaheadPriceIndex && blockRunningBogo);
              pendingBogo = false;
              bogoLookaheadPriceIndex = -1;
          } else if (lineHasBogo) {
              pendingBogo = true;
          }
          
          let urlMatch = line.match(/(https?:\/\/[^\s]+)/);
          let lineLink = urlMatch ? urlMatch[0] : null;

          let dates = extractDates(line);
          if (dates.length > 0) {
              let priceForTheseDates = blockRunningPrice;
              let bogoForTheseDates = lineHasBogo || pendingBogo || blockRunningBogo;
              if (!priceMatch && i < lines.length - 1) {
                  const nextLine = lines[i+1];
                  let nextPriceMatch = null;
                  if (nextLine.includes('→') || nextLine.includes('->')) {
                      const parts = nextLine.split(/→|->/);
                      nextPriceMatch = parts[parts.length - 1].match(/([0-9,]{4,})/);
                  } else {
                      for (let rx of priceRegexes) { nextPriceMatch = nextLine.match(rx); if (nextPriceMatch) break; }
                  }
                  if (nextPriceMatch && extractDates(nextLine).length === 0) { 
                    priceForTheseDates = nextPriceMatch[1].replace(/,/g, ''); 
                    blockRunningPrice = priceForTheseDates; 
                    bogoForTheseDates = lineHasBogo || pendingBogo || nextLine.includes('買一送一');
                    blockRunningBogo = bogoForTheseDates;
                    bogoLookaheadPriceIndex = i + 1;
                    lineIsPak = linePackageType ?? getPackageType(nextLine) ?? packageSection;
                    blockRunningPackage = lineIsPak;
                  }
              }
              if (!priceForTheseDates) { 
                  for (let j = 0; j < lines.length; j++) { 
                      let pm = null;
                      if (lines[j].includes('→') || lines[j].includes('->')) {
                          const parts = lines[j].split(/→|->/);
                          pm = parts[parts.length - 1].match(/([0-9,]{4,})/);
                      } else {
                          for (let rx of priceRegexes) { pm = lines[j].match(rx); if (pm) break; }
                      }
                      if (pm) { priceForTheseDates = pm[1].replace(/,/g, ''); blockRunningPrice = priceForTheseDates; break; } 
                  } 
              }

              if (!currentTitleContext) {
                  let cleanLine = line.replace(/^[\p{Extended_Pictographic}\s❗️🔥✨⭐⚡️👉【】\[\]()]+|[\p{Extended_Pictographic}\s❗️🔥✨⭐⚡️]+$/gu, '').replace(/^(更新|降價|再調|大降價|清艙|促銷|最後機會|最新|快訊)\s*/gi, '').trim();
                  cleanLine = cleanLine.replace(/^(?:202[4-9][\/\-])?\d{1,2}[\/\-]\d{1,2}\s*/, '');
                  if (cleanLine.length > 2) currentTitleContext = cleanLine;
              }

              for (let dateStr of dates) {
                  if (blockEarliestDate) {
                      let parts = dateStr.split('-');
                      let d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
                      let diffDays = Math.round((d - blockEarliestDate) / (1000 * 60 * 60 * 24));
                      
                      if (diffDays > 0) {
                          if (line.match(/回程|抵達|回航/)) continue;
                          if (line.match(/\d{2}:\d{2}/) && !line.match(/出發|席|位|剩|\$|元|起|價/)) continue;
                          if (blockDays && (diffDays === blockDays - 1 || diffDays === blockDays || diffDays === blockDays + 1)) {
                              if (!line.match(/出發|席|位|剩|\$|元|起|價/)) continue;
                          }
                      }
                  }
                  
                  items.push({ 
                    date: dateStr, 
                    price: priceForTheseDates || '', 
                    isFlightAndHotel: lineIsPak, 
                    isBogo: bogoForTheseDates,
                    isTour: isGlobalTour,
                    packageContext: line.match(/(?:機酒|機加酒|方案)\s*[1-9Ａ-ＺA-Z]/)?.[0] || '',
                    cityContext: currentCityContext, 
                    titleContext: currentTitleContext,
                    airlineContext: (() => {
                      const titleAirline = inferAirlineFromCode(currentTitleContext);
                      if (titleAirline === '亞航' && ['泰亞航', '全亞航'].includes(blockAirline)) return blockAirline;
                      return titleAirline || blockAirline || sharedAirline;
                    })(),
                    link: lineLink || blockGlobalLink,
                    blockText: block.trim() + footerText
                  });
              }
              if (pendingBogo) {
                  blockRunningBogo = bogoForTheseDates;
                  pendingBogo = false;
              }
          }
        }
      }
      return items;
    }

