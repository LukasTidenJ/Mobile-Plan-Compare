---
name: Swedish Telecom Scraping Techniques
description: How to scrape prices from Swedish mobile operators (TRE, Tele2, Comviq, Telenor, Vimla, Telia, Fello)
---

# Swedish Telecom Scraper Knowledge

## Key Findings (per operator)

### TRE — Hardcoded
- Prices from paper: Obegränsad 299kr, 50GB 249kr, 12GB 219kr
- Family: 129 kr/mån per extra person, unlimited plans only
- No public API or scrapable page found

### Vimla — GTM Ecommerce JSON + markdown fallback
- URL: `https://vimla.se/` (homepage)
- Primary: markdown-style regex `### X GB ... därefter Y kr/mån` on stripped HTML
- Fallback: GTM ecommerce JSON in `data-gtm` attributes
- Pattern: `data-gtm="&quot;data&quot;:{&quot;ecommerce&quot;:{&quot;items&quot;:[...]}}"`
- After decoding `&quot;` → `"`, parse as JSON: `obj.data.ecommerce.items`
- Item format: `{ item_name: "regular 5 GB", price: 120 }` (item_name like "regular X GB")
- **No family plan** — each person needs a separate subscription at full price
- Tipsrabatt (10 kr/mån referral) exists but is not modeled in the app

### Comviq — SSR Regex on /mobilabonnemang
- URL: `https://www.comviq.se/mobilabonnemang` (1MB SSR HTML)
- Pattern: `Mobilabonnemang . Nu: X GB . Tidigare:Y kr/mån . Nu:Z kr/mån`
- Family URL: `https://www.comviq.se/mobilabonnemang/familj`
- Family price: scrape "Lägg till medlemmar X kr/mån" or "för bara X kr/mån per abonnemang"
- No Obegränsad plan available

### Tele2 — Tier-based Price Matching
- URL: `https://www.tele2.se/mobilabonnemang`
- Tier mapping (original price → plan): 329→15GB, 479→Obegränsad, 519→Obegränsad Max
- Also try generic GB→price extraction with wider window
- Family URL: `https://www.tele2.se/mobilabonnemang/familj` — extra user ~149 kr/mån

### Telenor — Hero Text + GB/Price Extraction
- URL: `https://www.telenor.se/mobilabonnemang/` (69KB)
- Page uses HTML entities: `&aring;`→å, `&auml;`→ä — MUST decode before regex
- Hero text: "Surfa obegränsat med 5G från X kr/mån" → extract as Obegränsad price
- Pattern: `/Surfa\s+obegr[åa]nsat[^<]{0,100}?(\d{3,4})\s*kr\/m[åa]n/i`
- Family URL: `https://www.telenor.se/handla/mobilabonnemang/telenor-familj/` (NOT `/mobilabonnemang/familj`)
- Family price: `"discountedPrice":"229 kr/mån"` in page JSON, or "Lägg till extra användare ... X kr/mån"

### Telia — SSR Regex Attempt (fragile)
- URL: `https://www.telia.se/mobilabonnemang`
- Next.js CSR — SSR may or may not contain plan cards
- Pattern: `Mobilabonnemang ... (Obegränsad Plus|X GB) ... Visa detaljer Y kr/mån Z kr/mån`
- Family URL: `https://www.telia.se/mobilabonnemang/familj`
- Family price: `Ord. pris X kr/mån` or `Ordinarie pris: X kr/mån`, unlimited only
- SVG path data can cause false positives — always strip SVGs first
- Falls back to error if zero plans scraped

### Fello — Markdown Regex Attempt (fragile)
- URL: `https://fello.se/mobilabonnemang/`
- Gatsby CSR — page must exceed 10KB for scrape attempt
- Pattern: `### X GB|Obegränsad ... därefter Y kr/mån`
- **No family plan** — each person needs a separate subscription at full price
- Falls back to error if zero plans scraped

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
2. Site-specific SSR patterns (Comviq, Telia)
3. Tier-based price matching (Tele2)
4. Hero text extraction (Telenor)
5. Markdown-style regex (Fello, Vimla)

### Family Pricing Summary
| Operator | Family? | extraUserPrice source |
|----------|---------|----------------------|
| TRE | Yes (unlimited only) | Hardcoded 129 kr |
| Telia | Yes (unlimited only) | `/mobilabonnemang/familj` |
| Tele2/Comviq | Yes | `/mobilabonnemang/familj` |
| Telenor | Yes | `/handla/mobilabonnemang/telenor-familj/` |
| Fello | **No** | — |
| Vimla | **No** | — |

**Why:** Saved to avoid re-discovering these scraping approaches in future sessions.
**How to apply:** When updating the scraper at `artifacts/api-server/src/lib/scraper.ts`
