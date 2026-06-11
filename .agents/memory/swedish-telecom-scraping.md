---
name: Swedish Telecom Scraping Techniques
description: How to scrape prices from Swedish mobile operators (TRE, Tele2, Comviq, Telenor, Vimla, Telia, Fello)
---

# Swedish Telecom Scraper Knowledge

## Key Findings (per operator)

### TRE — Hardcoded
- Prices from paper: Obegränsad 299kr, 50GB 249kr, 12GB 219kr
- No public API or scrapable page found

### Vimla — GTM Ecommerce JSON (most reliable)
- URL: `https://vimla.se/` (homepage)
- Plans embedded as JSON in `data-gtm` attributes on DOM elements
- Pattern: `data-gtm="&quot;data&quot;:{&quot;ecommerce&quot;:{&quot;items&quot;:[...]}}"`
- After decoding `&quot;` → `"`, parse as JSON: `obj.data.ecommerce.items`
- Item format: `{ item_name: "regular 5 GB", price: 120 }` (item_name like "regular X GB")
- 2025/2026 plans: 5GB=120, 10GB=170, 15GB=210, 25GB=260, 100GB=370 kr/mån
- Note: "DOUBLE_DATA_24M" promo doubles GB for 24 months, so "5GB" plan user gets 10GB

### Comviq — SSR Regex on /mobilabonnemang
- URL: `https://www.comviq.se/mobilabonnemang` (1MB SSR HTML)
- Has actual kr/mån prices in SSR content (Astro.js with SSR props)
- Plans found: 100GB=359, 20GB=229, 5GB=129 kr/mån
- No Obegränsad plan available

### Tele2 — Tier-based Price Matching
- URL: `https://www.tele2.se/privat/` (722KB)
- Page has 149/199/249/299 kr/mån prices in SSR HTML but no GB amounts nearby
- Use tier-based mapping: 149→25GB, 199→50GB, 249→100GB, 299→Obegränsad
- Verify: extract all prices in 100-500 kr range and match against known tier points

### Telenor — Hero Text Extraction
- URL: `https://www.telenor.se/mobilabonnemang/` (69KB)
- Page uses HTML entities: `&aring;`→å, `&auml;`→ä — MUST decode before regex
- Hero text: "Surfa obegränsat med 5G från 449 kr/mån" → extract 449 as Obegränsat price
- Pattern: `/Surfa\s+obegr[åa]nsat[^<]{0,100}?(\d{3,4})\s*kr\/m[åa]n/i`
- No individual GB plan data in SSR HTML

### Telia — Cannot Scrape (CSR)
- Next.js app with client-side rendering
- SSR HTML has `__NEXT_DATA__` of only 187 chars (empty)
- SVG path data in page contains numbers that can be mistaken for prices (e.g. 669 from SVG coordinate 16.697)
- Return error: "Besök telia.se för aktuella priser"

### Fello — Cannot Scrape (CSR)
- Gatsby.js app with client-side rendering
- Homepage shows 120 in OG image URL, not a price
- Return error: "Besök fello.se för aktuella priser"

## Critical Techniques

### HTML Entity Decoding (REQUIRED for Swedish)
Many pages use HTML entities for Swedish characters:
- `&aring;` → å, `&auml;` → ä, `&ouml;` → ö (and uppercase versions)
- `&#229;` → å, `&#228;` → ä, `&#246;` → ö
- MUST decode BEFORE running any regex

### Strip SVGs (prevents false positives)
SVG path data contains numbers like `16.697` that partial-match price regexes.
Strip: `html.replace(/<svg[\s\S]*?<\/svg>/gi, ' ')`

### GTM Ecommerce Data Pattern
```typescript
const re = /data-gtm="({[^"]+})"/gi;
// decode &quot; → ", &#39; → ', &amp; → &
// JSON.parse, then obj.data?.ecommerce?.items
// Each item: { item_name: "regular 5 GB", price: 120 }
```

### Prices vs. GB Amounts Often Separated
Many telecom pages put GB amounts and prices in different DOM sections (far apart).
Forward regex (GB→price within N chars) doesn't work. Strategies:
1. GTM ecommerce JSON (best)
2. Tier-based price matching (Tele2)
3. Hero text extraction (Telenor)
4. SSR props scanning (Comviq)

**Why:** Saved to avoid re-discovering these scraping approaches in future sessions.
**How to apply:** When updating the scraper at `artifacts/api-server/src/lib/scraper.ts`
