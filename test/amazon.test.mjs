// Testar Creators API-klienten mot en lokal låtsasserver (inga riktiga nycklar behövs).
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createClient, simplify, RESOURCES } from '../scripts/lib/amazon.mjs';

function mock() {
  const calls = [];
  const server = createServer(async (req, res) => {
    let body = ''; for await (const c of req) body += c;
    calls.push({ url: req.url, headers: req.headers, body });
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/token') return res.end(JSON.stringify({ access_token: 'TOKEN123', expires_in: 3600 }));
    if (req.url === '/catalog/v1/getItems') {
      const { itemIds } = JSON.parse(body);
      return res.end(JSON.stringify({
        itemsResult: { items: itemIds.filter((a) => a !== 'B000MISSIN').map((asin) => ({
          asin, detailPageURL: `https://www.amazon.se/dp/${asin}?tag=test-21`,
          itemInfo: { title: { displayValue: `Produkt ${asin}` } },
          images: { primary: { large: { url: `https://m.media-amazon.com/images/I/${asin}.jpg`, width: 500, height: 400 } } },
          offersV2: { listings: [
            { isBuyBoxWinner: false, price: { money: { amount: 999, currency: 'SEK', displayAmount: '999,00 kr' } } },
            { isBuyBoxWinner: true, price: { money: { amount: 499, currency: 'SEK', displayAmount: '499,00 kr' } }, availability: { message: 'I lager' } },
          ] },
        })) },
        errors: itemIds.includes('B000MISSIN') ? [{ code: 'ItemNotAccessible', message: 'B000MISSIN not accessible' }] : undefined,
      }));
    }
    if (req.url === '/catalog/v1/searchItems') return res.end(JSON.stringify({ searchResult: { items: [{ asin: 'B0SEARCH01', itemInfo: { title: { displayValue: 'Träff' } } }] } }));
    res.statusCode = 404; res.end('{}');
  });
  return new Promise((ok) => server.listen(0, () => ok({ server, calls, url: `http://localhost:${server.address().port}` })));
}

test('v3 (LWA): JSON-token, Bearer-header, x-marketplace och korrekt body', async () => {
  const m = await mock();
  const c = createClient({ id: 'ID', secret: 'SEC', version: '3.2', apiHost: m.url, tokenUrl: `${m.url}/token`, marketplace: 'www.amazon.se' });
  const res = await c.getItems(['B0AAAAAAAA', 'B0BBBBBBBB'], 'test-21');
  await c.getItems(['B0CCCCCCCC'], 'test-21'); // token ska återanvändas

  const tokenCalls = m.calls.filter((x) => x.url === '/token');
  assert.equal(tokenCalls.length, 1);
  assert.equal(tokenCalls[0].headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(tokenCalls[0].body), { grant_type: 'client_credentials', client_id: 'ID', client_secret: 'SEC', scope: 'creatorsapi::default' });

  const call = m.calls.find((x) => x.url === '/catalog/v1/getItems');
  assert.equal(call.headers.authorization, 'Bearer TOKEN123');
  assert.equal(call.headers['x-marketplace'], 'www.amazon.se');
  assert.deepEqual(JSON.parse(call.body), { itemIds: ['B0AAAAAAAA', 'B0BBBBBBBB'], partnerTag: 'test-21', resources: RESOURCES });

  const s = simplify(res.itemsResult.items[0]);
  assert.deepEqual(s, {
    asin: 'B0AAAAAAAA', title: 'Produkt B0AAAAAAAA', url: 'https://www.amazon.se/dp/B0AAAAAAAA?tag=test-21',
    img: { url: 'https://m.media-amazon.com/images/I/B0AAAAAAAA.jpg', w: 500, h: 400 },
    price: { amount: 499, currency: 'SEK', display: '499,00 kr' }, availability: 'I lager',
  });
  m.server.close();
});

test('v2 (Cognito): formulärkodad token och Version i Authorization', async () => {
  const m = await mock();
  const c = createClient({ id: 'ID', secret: 'SEC', version: '2.2', apiHost: m.url, tokenUrl: `${m.url}/token`, marketplace: 'www.amazon.se' });
  await c.searchItems('hörlurar', 'test-21');
  const t = m.calls.find((x) => x.url === '/token');
  assert.equal(t.headers['content-type'], 'application/x-www-form-urlencoded');
  assert.equal(new URLSearchParams(t.body).get('scope'), 'creatorsapi/default');
  const call = m.calls.find((x) => x.url === '/catalog/v1/searchItems');
  assert.equal(call.headers.authorization, 'Bearer TOKEN123, Version 2.2');
  assert.equal(JSON.parse(call.body).keywords, 'hörlurar');
  m.server.close();
});

test('produkt utan erbjudande ger price: null', () => {
  assert.equal(simplify({ asin: 'B0X', itemInfo: { title: { displayValue: 'X' } } }).price, null);
});

test('saknade nycklar och okänd version ger tydliga fel', () => {
  assert.throws(() => createClient({ version: '3.2' }), /AMAZON_CREDENTIAL_ID/);
  assert.throws(() => createClient({ id: 'a', secret: 'b', version: '9.9' }), /Okänd AMAZON_CREDENTIAL_VERSION/);
});
