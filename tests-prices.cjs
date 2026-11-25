const assert = require('node:assert/strict');
const {harness, simple} = require('./test-helpers.cjs');
const fixtures = require('./price-fixtures.json');
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log('PASS ' + name); }
(async () => {
  const h = harness(), c = h.context;
  await test('Discount amounts never replace a full sale price', () => {
    const offers = c.parseRawDetails(fixtures['清艙56']);
    assert(offers.length); assert(offers.every(t => t.price === '89900' && t.priceUnit === 'person'));
  });
  await test('Visa fees and repeated itinerary dates cannot become extra tour quotes', () => {
    const offers = c.parseRawDetails(fixtures['旅行團380']);
    assert.equal(offers.length, 4);
    const nov = offers.filter(t => t.date === '2026-11-30'), dec = offers.filter(t => t.date === '2026-12-14');
    assert.equal(nov.length, 1); assert.equal(dec.length, 1);
    assert.equal(nov[0].price, '39499'); assert.equal(nov[0].link, 'https://reurl.cc/gN3yRp');
    assert.equal(dec[0].price, '39999'); assert.equal(dec[0].link, 'https://reurl.cc/QNkA5q');
    assert(offers.every(t => t.priceUnit === 'pair'));
  });
  await test('Standalone buy-one-get-one headings apply to every price group in that product only', () => {
    const offers = c.parseRawDetails(fixtures['清艙95']);
    const pairs = offers.filter(t => t.priceUnit === 'pair');
    assert.equal(pairs.length, 6); assert(pairs.every(t => t.isBogo));
    assert(pairs.some(t => t.date === '2027-01-05' && t.price === '16488' && t.perPersonPrice === '8244'));
    assert(offers.filter(t => Number(t.price) < 10000).every(t => !t.isBogo && t.priceUnit !== 'pair'));
  });
  await test('Unpriced summary blocks do not create offers or inherit a following product price', () => {
    const offers = c.parseRawDetails(fixtures['旅行團358']);
    assert(offers.every(t => Number(t.price) > 0));
    assert.equal(offers.filter(t => t.date === '2026-12-05').length, 1);
    assert.equal(offers.find(t => t.date === '2026-12-05').price, '74900');
    assert.equal(offers.find(t => t.date === '2027-02-04').price, '46900');
  });
  await test('Low prices explicitly stated by the source remain unchanged', () => {
    for (const [key, expected] of [['清艙156', '4800'], ['清艙170', '4499']]) {
      assert(c.parseRawDetails(fixtures[key]).some(t => t.price === expected));
    }
  });
  await test('Itinerary links may supply departure dates when no separate departure list exists', () => {
    const offers = c.parseRawDetails(fixtures['旅行團5']);
    for (const date of ['2027-05-18', '2027-05-25']) assert(offers.some(t => t.date === date && t.price === '29900'));
  });
  await test('A parenthesized per-person equivalent does not relabel the total as per person', () => {
    const offers = c.parseRawDetails(fixtures['旅行團8']).filter(t => t.price === '23500');
    assert.equal(offers.length, 2); assert(offers.every(t => t.priceUnit === 'pair' && t.perPersonPrice === '11750'));
  });
  await test('Supplementary fees, deposits, savings and URL numbers are not sale prices', () => {
    for (const text of ['簽證及快通費另收 NT$ 1,500/人', '訂金 $5000', '單人房差 $3000', '第2人現折 $10,000', '平均每人$7,744', '小費 $1500', '嬰兒 $2500', '行程 https://example.com/price/$1500', '$1,500/人簽證費', '$10000折抵', '簽證費 → $1500']) assert.equal(c.readSalePrice(text), null, text);
    assert.equal(c.parseRawDetails('東京五日\n出發日：2027/1/12\n另收簽證費$1500').length, 0);
  });
  await test('Arrow sale prices, fullwidth currency and same-line fees preserve the actual sale', () => {
    for (const text of ['原價 $88,900 → 特惠 $74,900', '原價88,900 → 74,900', '＄74,900', '售價$74900，另收簽證費$1500', '原價$88900 → $74900 ($37450/人)']) assert.equal(c.readSalePrice(text)[1], '74900');
  });
  await test('Per-line promotions stop at the next ordinary price', () => {
    const offers = c.parseRawDetails('酷航首爾5日\n買一送一 $15488 出發日：2027/1/12\n$7800 出發日：2027/1/13');
    assert.equal(offers[0].priceUnit, 'pair'); assert.notEqual(offers[1].priceUnit, 'pair');
  });
  await test('Explicit per-person prices remain per person even under a promotion heading', () => {
    const t = c.parseRawDetails('酷航首爾5日 買一送一\n每人$7744 出發日：2027/1/12')[0];
    assert.equal(t.priceUnit, 'person'); assert.equal(t.price, '7744');
  });
  await test('Pair offers coexist with ordinary offers on the same date and flights', async () => {
    const h2 = harness(undefined, [{details:simple('酷航首爾5日', 'TR872', 'TR873', '2027/1/12','7800')}, {details:simple('酷航首爾5日', 'TR872', 'TR873', '2027/1/12','15488').replace('$ 15488','兩人 $15488')}]);
    await h2.context.fetchSheetData(); assert.equal(h2.state().tickets.length, 2);
    const pair = h2.state().tickets.find(t => t.priceUnit === 'pair');
    assert.match(h2.context.offerCardHTML(pair), /參考報價 · 兩人合計/);
    const inquiry = decodeURIComponent(h2.context.inquiryUrl(pair));
    assert.match(inquiry, /金額：\$15488（兩人合計）/); assert(!/商品：|版本：/.test(inquiry));
    h2.context.openModalFromItem(pair.id);
    assert((h2.get('modal-root').innerHTML.match(/兩人合計/g)||[]).length >= 2);
  });
  console.log(`RESULT ${passed} price checks passed`);
})().catch(e => {console.error(e); process.exitCode = 1;});
