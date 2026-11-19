// Minimal klient för Amazon Creators API (efterföljaren till Product Advertising API 5.0).
// Inga beroenden – bara Node 20+ (global fetch).
//
// Format hämtat från Amazons officiella SDK (creatorsapi-python-sdk 1.3):
//   Token:   OAuth 2.0 client credentials. Endpoint beror på "credential version" som visas
//            i Associates Central (Tools → Creators API). Europa = 2.2 eller 3.2.
//   Anrop:   POST https://creatorsapi.amazon/catalog/v1/{getItems|searchItems}
//            Authorization: Bearer <token>            (v3.x)
//            Authorization: Bearer <token>, Version <v> (v2.x)
//            x-marketplace: www.amazon.se

const TOKEN_ENDPOINTS = {
  '2.1': 'https://creatorsapi.auth.us-east-1.amazoncognito.com/oauth2/token',
  '2.2': 'https://creatorsapi.auth.eu-south-2.amazoncognito.com/oauth2/token',
  '2.3': 'https://creatorsapi.auth.us-west-2.amazoncognito.com/oauth2/token',
  '3.1': 'https://api.amazon.com/auth/o2/token',
  '3.2': 'https://api.amazon.co.uk/auth/o2/token',
  '3.3': 'https://api.amazon.co.jp/auth/o2/token',
};

export const RESOURCES = [
  'itemInfo.title',
  'images.primary.large',
  'offersV2.listings.price',
  'offersV2.listings.availability',
  'offersV2.listings.isBuyBoxWinner',
];

export function readEnv() {
  try { process.loadEnvFile?.('.env'); } catch { /* ingen .env – ok, t.ex. i CI */ }
  const e = process.env;
  return {
    id: e.AMAZON_CREDENTIAL_ID,
    secret: e.AMAZON_CREDENTIAL_SECRET,
    version: (e.AMAZON_CREDENTIAL_VERSION || '3.2').trim(),
    partnerTag: e.AMAZON_PARTNER_TAG,
    apiHost: e.AMAZON_API_HOST || 'https://creatorsapi.amazon',
    tokenUrl: e.AMAZON_TOKEN_URL || null, // bara för test mot en lokal mock
  };
}

export function createClient({ id, secret, version, apiHost, tokenUrl, marketplace }) {
  if (!id || !secret) throw new Error('AMAZON_CREDENTIAL_ID och AMAZON_CREDENTIAL_SECRET saknas (se .env.example).');
  const isLwa = version.startsWith('3.');
  const endpoint = tokenUrl || TOKEN_ENDPOINTS[version];
  if (!endpoint) throw new Error(`Okänd AMAZON_CREDENTIAL_VERSION "${version}". Giltiga: ${Object.keys(TOKEN_ENDPOINTS).join(', ')}`);

  let token = null, expires = 0;

  async function getToken() {
    if (token && Date.now() < expires) return token;
    const body = { grant_type: 'client_credentials', client_id: id, client_secret: secret,
                   scope: isLwa ? 'creatorsapi::default' : 'creatorsapi/default' };
    const res = await fetch(endpoint, isLwa
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
    const text = await res.text();
    if (!res.ok) throw new Error(`Token-anropet misslyckades (${res.status}): ${text.slice(0, 300)}`);
    const data = JSON.parse(text);
    if (!data.access_token) throw new Error('Inget access_token i svaret.');
    token = data.access_token;
    expires = Date.now() + ((data.expires_in || 3600) - 60) * 1000;
    return token;
  }

  async function call(operation, payload, attempt = 1) {
    const t = await getToken();
    const res = await fetch(`${apiHost}/catalog/v1/${operation}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-marketplace': marketplace,
        Authorization: isLwa ? `Bearer ${t}` : `Bearer ${t}, Version ${version}`,
      },
      body: JSON.stringify(payload),
    });
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await sleep(1500 * 2 ** attempt);
      return call(operation, payload, attempt + 1);
    }
    if (res.status === 401) token = null;
    const text = await res.text();
    if (!res.ok) throw new Error(`${operation} misslyckades (${res.status}): ${text.slice(0, 500)}`);
    return JSON.parse(text);
  }

  return {
    getItems: (itemIds, partnerTag) => call('getItems', { itemIds, partnerTag, resources: RESOURCES }),
    searchItems: (keywords, partnerTag, itemCount = 10) =>
      call('searchItems', { keywords, partnerTag, itemCount, searchIndex: 'All', resources: RESOURCES }),
  };
}

// Plockar ut det vi behöver ur ett item i API-svaret.
export function simplify(item) {
  const listings = item.offersV2?.listings || [];
  const offer = listings.find((l) => l.isBuyBoxWinner) || listings[0];
  const money = offer?.price?.money;
  const img = item.images?.primary?.large;
  return {
    asin: item.asin,
    title: item.itemInfo?.title?.displayValue || null,
    url: item.detailPageURL || null,
    img: img?.url ? { url: img.url, w: img.width || null, h: img.height || null } : null,
    price: money?.amount != null ? { amount: money.amount, currency: money.currency, display: money.displayAmount || null } : null,
    availability: offer?.availability?.message || null,
  };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
