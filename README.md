# Gearwise – affiliate-sajt för teknik & gadgets

En statisk sajt där varje produkt länkar till Amazon.se med affiliatelänk. Amazon sköter betalning, leverans, returer och kundservice; sajten tjänar provision via Amazon Associates.

Ett litet byggsteg i Node (inga beroenden) genererar hela sajten till `dist/`:

- startsida med filter, sök, sortering och favoriter
- **en sida per produkt** (`/produkt/<slug>/`) med köpguide
- **jämförelse** av 2–3 prylar (`/jamfor/`)
- **Om oss**, **integritetspolicy**, **cookies**, 404
- `sitemap.xml`, `robots.txt`, Open Graph-taggar, favicon/app-ikoner, webmanifest, `products.json`

Lighthouse (mobil, lokalt): 100 / 100 / 100 / 100 på startsida, produktsida, jämförelse och integritetspolicy.

## Kom igång

Kräver Node 20.12 eller senare.

```bash
npm run dev        # bygger och startar http://localhost:8080
npm test           # testar API-klienten och bygget
```

## Filer

| Fil | Innehåll |
|---|---|
| `site.config.json` | Namn, domän, **partnerTag**, kontaktadress, **personuppgiftsansvarig**, webbhotell, kategorier |
| `data/catalog.json` | Produkterna: namn, kategori, ikon, prisklass, sökord, texter och köpguide. Valfritt `asin` och `img` |
| `data/amazon.json` | Skapas av `npm run fetch`. Checkas inte in |
| `src/style.css`, `src/app.js`, `src/hero.svg` | Utseende, klientskript och illustration |
| `static/` | Kopieras rakt in i `dist/`: typsnitt (egen server, OFL-licens), favicon, ikoner, `og.png` |
| `scripts/build.mjs` | Bygger sajten |
| `scripts/fetch-amazon.mjs`, `scripts/find-asin.mjs`, `scripts/lib/amazon.mjs` | Amazon Creators API |
| `scripts/make-images.mjs` | Renderar om PNG-ikoner och `og.png` (kräver Playwright) |

### Produktfält i `data/catalog.json`

`slug` (URL), `name`, `cat` (måste finnas i `categories`), `icon` (nyckel i `scripts/lib/icons.mjs`), `lvl` 1–3, `pop`, `q` (sökord på Amazon), `why`, `bullets`, `guide` (`intro`, `consider` [[rubrik, text]…], `forWho`, `skipIf`).

- `asin` – Amazons produkt-ID. Ger direktlänk `/dp/ASIN?tag=…` och gör att API:t hämtar titel, bild och pris. Utan ASIN länkar knappen till en sökning.
- `img` – bild-URL som Amazon själva tillhandahåller (SiteStripe). Ladda aldrig ner bilden till egen server. Laddar bilden inte visas den ritade ikonen.

## Amazon: produkter, bilder och priser

**Product Advertising API 5.0 är nedlagt.** Efterföljaren heter **Creators API** och använder OAuth 2.0 i stället för AWS-signering. Det här projektet använder Creators API.

Formatet för anropen kommer från Amazons officiella SDK, `creatorsapi-python-sdk` 1.3. Amazons dokumentationssajt gick inte att nå när detta byggdes.

| Del | Format |
|---|---|
| Token | Client credentials hos Login with Amazon (v3.x) eller Cognito (v2.x). Europa är version **2.2** eller **3.2**, och versionen står vid nyckeln i Associates Central. |
| Anrop | `POST https://creatorsapi.amazon/catalog/v1/getItems` (och `searchItems`) med `x-marketplace: www.amazon.se` |

### Åtkomst

1. Du behöver ett godkänt Amazon Associates-konto för amazon.se.
2. Enligt flera källor (inte bekräftat mot Amazons egen sida) krävs dessutom **minst 10 kvalificerade köp de senaste 30 dagarna**.
3. Bara kontots huvudägare kan skapa nycklar.

### Arbetsflöde

1. `cp .env.example .env` och fyll i nycklarna.
2. Hitta kandidater: `npm run find -- usb-c-laddare-65w` (använder produktens sökord) eller `npm run find -- "valfritt sökord"`.
3. Bedöm själv vilken produkt som är värd att tipsa om och skriv in dess `asin` i `data/catalog.json`. Skriptet väljer inget åt dig.
4. `npm run refresh` hämtar data från Amazon och bygger sajten.

### Regler som byggs in

| Regel | Så hanteras den |
|---|---|
| Pris bara från API:t | Priser visas bara om de kommer från API:t. Tidpunkten står bredvid, och under **Prisinfo** finns Amazons standardtext på svenska. |
| Max 24 timmar gammal data | API-data som är äldre än 24 timmar används inte vid bygget. Webbläsaren tar dessutom bort priser som har blivit äldre än 24 timmar på en sida som legat kvar. |
| Inga kopierade bilder | Bilder visas direkt från Amazons servrar och kopieras aldrig. |
| Obligatorisk partnertext | Texten "Som Amazon-partner tjänar Gearwise på kvalificerade köp" finns i sidfoten på varje sida. |
| Länkattribut | Alla Amazon-länkar har `rel="nofollow sponsored noopener"`. Testerna kontrollerar det. |

Tills API-åtkomst finns fungerar sajten utan priser. Knapparna leder då till en sökning på Amazon, och de ritade ikonerna visas i stället för bilder.

## Driftsättning

### GitHub Pages (rekommenderat)

Arbetsflödet i `.github/workflows/deploy.yml` bygger vid push till `main` och dessutom var 12:e timme, så att priserna aldrig blir äldre än 24 timmar.

1. Skapa ett repo och pusha.
2. **Settings → Pages → Source: GitHub Actions**.
3. **Settings → Secrets and variables → Actions**:
   - Secrets: `AMAZON_CREDENTIAL_ID`, `AMAZON_CREDENTIAL_SECRET`
   - Variables: `AMAZON_CREDENTIAL_VERSION`, `AMAZON_PARTNER_TAG`
4. Egen domän: sätt `url` i `site.config.json`. Bygget skriver då `CNAME`. Lägg till domänen under Settings → Pages och peka DNS enligt GitHubs instruktioner.
5. Utan egen domän: sätt `url` till `https://<användare>.github.io` och `basePath` till `/<repo>/`.

GitHub stänger av schemalagda körningar i repon som inte har haft någon aktivitet på 60 dagar. Kör då arbetsflödet manuellt eller gör en commit.

### Netlify eller Vercel

Byggkommandot är `npm run build` och publiceringsmappen `dist`. `netlify.toml` finns med. För priser behövs dessutom en ombyggnad minst var 12:e timme, till exempel via en build hook.

## Checklista före lansering

Bygget varnar för det som saknas.

- [ ] `partnerTag` är ditt eget Associates-ID (exemplet `gearwise-21` är kvar).
- [ ] `owner` (och eventuellt `ownerOrgNr`) är ifyllt, eftersom integritetspolicyn måste ange personuppgiftsansvarig.
- [ ] `contactEmail` är en adress som fungerar (`hej@gearwise.se` är en platshållare).
- [ ] `hosting` matchar ditt webbhotell, och `policyUpdated` är satt.
- [ ] `url` är rätt domän (används i canonical, sitemap och Open Graph).
- [ ] Läs igenom integritetspolicyn och cookiesidan. De är skrivna utifrån hur sajten fungerar, men är ingen juridisk granskning.
- [ ] Lägg in sajten i Google Search Console och skicka in `sitemap.xml`.

## Principer

- Hitta aldrig på betyg, recensioner eller kundomdömen. Köpguiderna beskriver vad som skiljer produkttyper åt, inte tester vi inte har gjort.
- Inga cookies, ingen analys och ingen spårning på sajten. Lägger du till statistik måste besökarna samtycka först, och cookiesidan och integritetspolicyn behöver uppdateras.
