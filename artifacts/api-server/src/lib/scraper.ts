import axios from "axios";

export interface PlanPrice {
  name: string;
  dataAmount: string;
  dataGb: number | null;
  price: number;
  originalPrice: number | null;
  isUnlimited: boolean;
}

export interface OperatorPrices {
  id: string;
  name: string;
  parentOperator: string | null;
  plans: PlanPrice[];
  lastUpdated: string;
  isLive: boolean;
  error: string | null;
}

const HTTP_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "sv-SE,sv;q=0.9,en-US;q=0.8,en;q=0.7",
  "Accept-Encoding": "gzip, deflate, br",
  Connection: "keep-alive",
};

const TIMEOUT_MS = 15000;

async function fetchHtml(url: string): Promise<string> {
  const resp = await axios.get(url, {
    headers: HTTP_HEADERS,
    timeout: TIMEOUT_MS,
    maxRedirects: 5,
    decompress: true,
  });
  return resp.data as string;
}

/** Decode HTML entities (å, ä, ö, etc.) so Swedish text is searchable */
function decodeEntities(html: string): string {
  return html
    .replace(/&aring;/g, "å")
    .replace(/&auml;/g, "ä")
    .replace(/&ouml;/g, "ö")
    .replace(/&Aring;/g, "Å")
    .replace(/&Auml;/g, "Ä")
    .replace(/&Ouml;/g, "Ö")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) =>
      String.fromCharCode(parseInt(h, 16))
    );
}

/** Strip script/style/svg tags from HTML */
function stripScripts(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ");
}

function makePlan(
  operatorName: string,
  dataAmount: string,
  price: number,
  originalPrice?: number | null
): PlanPrice {
  const isUnlimited =
    dataAmount.toLowerCase().includes("obegr") ||
    dataAmount.toLowerCase().includes("unlimited");
  const gb = isUnlimited ? null : parseGb(dataAmount);
  return {
    name: `${operatorName} ${dataAmount}`,
    dataAmount,
    dataGb: gb,
    price,
    originalPrice: originalPrice ?? null,
    isUnlimited,
  };
}

function parseGb(amount: string): number | null {
  const m = amount.match(/(\d+)\s*GB/i);
  return m ? parseInt(m[1]) : null;
}

/**
 * Extract GB→price pairs from HTML. Decodes entities, strips scripts,
 * then tries forward (GB before price) and reverse (price before GB) patterns.
 */
function extractGbPricePairs(
  rawHtml: string,
  opts: {
    maxGb?: number;
    minPrice?: number;
    maxPrice?: number;
    windowChars?: number;
  } = {}
): Array<{ gbStr: string; price: number }> {
  const { maxGb = 500, minPrice = 50, maxPrice = 900, windowChars = 1200 } =
    opts;

  const html = decodeEntities(rawHtml);
  const stripped = stripScripts(html);

  const results: Array<{ gbStr: string; price: number }> = [];
  const seen = new Set<string>();

  // Forward: GB amount → kr/mån
  const fwd = new RegExp(
    `(\\d+)\\s*GB[\\s\\S]{1,${windowChars}}?(\\d{2,4})\\s*kr\\/m[åa]n`,
    "gi"
  );
  let m: RegExpExecArray | null;
  while ((m = fwd.exec(stripped)) !== null) {
    const gb = parseInt(m[1]);
    const price = parseInt(m[2]);
    if (
      gb <= maxGb &&
      price >= minPrice &&
      price <= maxPrice &&
      !seen.has(`gb-${gb}`)
    ) {
      seen.add(`gb-${gb}`);
      results.push({ gbStr: `${gb}GB`, price });
    }
    if (results.length >= 20) break;
  }

  // Look for Obegränsad/Obegränsat + price (forward)
  if (!seen.has("unlimited")) {
    const unlFwd = new RegExp(
      `Obegr[åä][^\\s<]{0,20}[\\s\\S]{0,${windowChars}}?(\\d{2,4})\\s*kr\\/m[åa]n`,
      "gi"
    );
    while ((m = unlFwd.exec(stripped)) !== null) {
      const price = parseInt(m[1]);
      if (price >= minPrice && price <= maxPrice) {
        seen.add("unlimited");
        results.push({ gbStr: "Obegränsad", price });
        break;
      }
    }
  }

  // Reverse: kr/mån → GB amount
  if (results.length < 5) {
    const rev = new RegExp(
      `(\\d{2,4})\\s*kr\\/m[åa]n[\\s\\S]{1,${windowChars}}?(\\d+)\\s*GB`,
      "gi"
    );
    while ((m = rev.exec(stripped)) !== null) {
      const price = parseInt(m[1]);
      const gb = parseInt(m[2]);
      if (
        gb <= maxGb &&
        price >= minPrice &&
        price <= maxPrice &&
        !seen.has(`gb-${gb}`)
      ) {
        seen.add(`gb-${gb}`);
        results.push({ gbStr: `${gb}GB`, price });
      }
      if (results.length >= 20) break;
    }
  }

  // Reverse: kr/mån → Obegränsad
  if (!seen.has("unlimited")) {
    const revUnl = new RegExp(
      `(\\d{2,4})\\s*kr\\/m[åa]n[\\s\\S]{0,${windowChars}}?Obegr`,
      "gi"
    );
    while ((m = revUnl.exec(stripped)) !== null) {
      const price = parseInt(m[1]);
      if (price >= minPrice && price <= maxPrice) {
        seen.add("unlimited");
        results.push({ gbStr: "Obegränsad", price });
        break;
      }
    }
  }

  return results;
}

function sortPlans(plans: PlanPrice[]): PlanPrice[] {
  return plans.sort((a, b) => {
    if (a.isUnlimited) return -1;
    if (b.isUnlimited) return 1;
    return (b.dataGb ?? 0) - (a.dataGb ?? 0);
  });
}

// ─── TRE (hardcoded from official price list) ────────────────────────────────
export async function fetchTre(): Promise<OperatorPrices> {
  return {
    id: "tre",
    name: "TRE",
    parentOperator: null,
    plans: [
      makePlan("TRE", "Obegränsad", 299),
      makePlan("TRE", "50GB", 249),
      makePlan("TRE", "12GB", 219),
    ],
    lastUpdated: new Date().toISOString(),
    isLive: false,
    error: null,
  };
}

// ─── COMVIQ (/mobilabonnemang has 1MB of SSR content) ────────────────────────
export async function fetchComviq(): Promise<OperatorPrices> {
  const base: OperatorPrices = {
    id: "comviq",
    name: "Comviq",
    parentOperator: "tele2",
    plans: [],
    lastUpdated: new Date().toISOString(),
    isLive: true,
    error: null,
  };

  try {
    const html = await fetchHtml("https://www.comviq.se/mobilabonnemang");
    const pairs = extractGbPricePairs(html, {
      maxGb: 300,
      minPrice: 50,
      maxPrice: 800,
      windowChars: 1200,
    });

    // Comviq also sells prepaid (kontantkort) — filter out suspiciously cheap large plans
    const filtered = pairs.filter((p) => {
      const gb = parseGb(p.gbStr);
      if (gb !== null && gb >= 30 && p.price < 80) return false;
      return true;
    });

    base.plans = sortPlans(filtered.map((p) => makePlan("Comviq", p.gbStr, p.price)));

    if (base.plans.length === 0) {
      base.error = "Kunde inte hämta priser";
    }
  } catch (err) {
    base.error = `Besök comviq.se för priser`;
  }

  return base;
}

// ─── TELE2 (/privat/ has 700KB SSR page; prices are in page but not near GB amounts) ──
export async function fetchTele2(): Promise<OperatorPrices> {
  const base: OperatorPrices = {
    id: "tele2",
    name: "Tele2",
    parentOperator: null,
    plans: [],
    lastUpdated: new Date().toISOString(),
    isLive: true,
    error: null,
  };

  // Tele2 plan tiers (GB label → expected price mapping for tier recognition)
  const TELE2_TIERS: Record<number, string> = {
    149: "25GB",
    199: "50GB",
    249: "100GB",
    299: "Obegränsad",
  };

  try {
    const html = await fetchHtml("https://www.tele2.se/privat/");
    const decoded = decodeEntities(html);

    // Step 1: Extract prices from page using known Tele2 subscription price points
    const priceRe = /(\d{2,3})\s*kr\/m[åa]n/gi;
    let m: RegExpExecArray | null;
    const rawPrices: number[] = [];
    while ((m = priceRe.exec(decoded)) !== null) {
      const v = parseInt(m[1]);
      if (v >= 100 && v <= 500) rawPrices.push(v);
    }
    const uniquePrices = [...new Set(rawPrices)].sort((a, b) => a - b);
    const tierPlans: PlanPrice[] = [];
    for (const p of uniquePrices) {
      const label = TELE2_TIERS[p] ?? null;
      if (label) {
        tierPlans.push(makePlan("Tele2", label, p));
      }
    }

    // Step 2: Also try generic GB→price extraction (wider window)
    const pairs = extractGbPricePairs(decoded, {
      maxGb: 400,
      minPrice: 100,
      maxPrice: 500,
      windowChars: 3000,
    });
    const scrapedPlans = pairs.map((p) => makePlan("Tele2", p.gbStr, p.price));

    // Merge: prefer tier-based when prices match known points, fill in any scraping extras
    const merged = new Map<string, PlanPrice>();
    for (const p of scrapedPlans) merged.set(p.dataAmount, p);
    for (const p of tierPlans) merged.set(p.dataAmount, p); // tier-based overrides

    base.plans = sortPlans([...merged.values()]);

    if (base.plans.length === 0) {
      base.error = "Besök tele2.se för aktuella priser";
    }
  } catch {
    base.error = "Besök tele2.se för aktuella priser";
  }

  return base;
}

// ─── TELIA (Next.js CSR — no reliable price data in SSR HTML) ───────────────
export async function fetchTelia(): Promise<OperatorPrices> {
  return {
    id: "telia",
    name: "Telia",
    parentOperator: null,
    plans: [],
    lastUpdated: new Date().toISOString(),
    isLive: true,
    error: "Besök telia.se för aktuella priser",
  };
}

// ─── FELLO (Gatsby CSR — subscription page) ──────────────────────────────────
export async function fetchFello(): Promise<OperatorPrices> {
  const base: OperatorPrices = {
    id: "fello",
    name: "Fello",
    parentOperator: "telia",
    plans: [],
    lastUpdated: new Date().toISOString(),
    isLive: true,
    error: null,
  };

  try {
    const html = await fetchHtml("https://fello.se/mobilabonnemang/");
    if (html.length < 10000) {
      base.error = "Besök fello.se för aktuella priser";
      return base;
    }
    const pairs = extractGbPricePairs(html, {
      maxGb: 500,
      minPrice: 60,
      maxPrice: 600,
      windowChars: 1500,
    });

    // Fello prices are in the 60-300 kr range; filter out meta/image artifacts
    const valid = pairs.filter((p) => p.price >= 60 && p.price <= 400);
    base.plans = sortPlans(valid.map((p) => makePlan("Fello", p.gbStr, p.price)));

    if (base.plans.length === 0) {
      base.error = "Besök fello.se för aktuella priser";
    }
  } catch {
    base.error = "Besök fello.se för aktuella priser";
  }

  return base;
}

// ─── TELENOR (/mobilabonnemang/ returns useful hero text with Obegränsat price)
export async function fetchTelenor(): Promise<OperatorPrices> {
  const base: OperatorPrices = {
    id: "telenor",
    name: "Telenor",
    parentOperator: null,
    plans: [],
    lastUpdated: new Date().toISOString(),
    isLive: true,
    error: null,
  };

  try {
    const html = await fetchHtml("https://www.telenor.se/mobilabonnemang/");
    const decoded = decodeEntities(html);
    const pairs = extractGbPricePairs(decoded, {
      maxGb: 500,
      minPrice: 100,
      maxPrice: 800,
      windowChars: 1500,
    });

    if (pairs.length > 0) {
      base.plans = sortPlans(pairs.map((p) => makePlan("Telenor", p.gbStr, p.price)));
    } else {
      // Fallback: Telenor page has "Surfa obegränsat med 5G från X kr/mån"
      const m = decoded.match(
        /Surfa\s+obegr[åa]nsat[^<]{0,100}?(\d{3,4})\s*kr\/m[åa]n/i
      );
      if (m) {
        const fromPrice = parseInt(m[1]);
        base.plans.push(makePlan("Telenor", "Obegränsad", fromPrice));
        base.error =
          "Startpris – välj plan på telenor.se för exakt pris";
      }

      // Also try to find fixed-data plans from the same page
      const fixedRe =
        /(\d{1,3})\s*GB[^<]{0,300}?(\d{2,3})\s*kr\/m[åa]n/gi;
      const stripped = stripScripts(decoded);
      let m2: RegExpExecArray | null;
      const seen = new Set<number>();
      while ((m2 = fixedRe.exec(stripped)) !== null) {
        const gb = parseInt(m2[1]);
        const price = parseInt(m2[2]);
        if (gb <= 500 && price >= 100 && price <= 600 && !seen.has(gb)) {
          seen.add(gb);
          base.plans.push(makePlan("Telenor", `${gb}GB`, price));
        }
        if (seen.size > 8) break;
      }
    }

    if (base.plans.length === 0) {
      base.error = "Besök telenor.se för aktuella priser";
    }
  } catch {
    base.error = "Besök telenor.se för aktuella priser";
  }

  return base;
}

/**
 * Parse GTM ecommerce items from data-gtm HTML attributes.
 * These contain the full product catalog as JSON.
 */
function extractGtmEcommerceItems(html: string): Array<{ name: string; price: number }> {
  const results: Array<{ name: string; price: number }> = [];
  const seen = new Set<string>();

  const re = /data-gtm="({[^"]+})"/gi;
  let m: RegExpExecArray | null;

  while ((m = re.exec(html)) !== null) {
    const raw = m[1]
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&");
    try {
      const obj = JSON.parse(raw) as {
        data?: { ecommerce?: { items?: Array<{ item_name?: string; price?: number }> } };
      };
      const items = obj.data?.ecommerce?.items;
      if (items && Array.isArray(items)) {
        for (const item of items) {
          const name = item.item_name ?? "";
          const price = item.price;
          if (name && typeof price === "number" && price > 0 && !seen.has(name)) {
            seen.add(name);
            results.push({ name, price });
          }
        }
      }
    } catch {
      // skip malformed JSON
    }
    if (results.length >= 20) break;
  }

  return results;
}

/** Parse GB amount from plan names like "regular 5 GB", "25GB", "Obegränsat" */
function parseGbFromName(name: string): { gbStr: string; isUnlimited: boolean } {
  const lower = name.toLowerCase();
  if (lower.includes("obegr") || lower.includes("unlimited") || lower.includes("obegränsat")) {
    return { gbStr: "Obegränsad", isUnlimited: true };
  }
  const m = name.match(/(\d+)\s*GB/i);
  if (m) return { gbStr: `${m[1]}GB`, isUnlimited: false };
  // Try plain number (e.g. "regular 5")
  const n = name.match(/(\d+)\s*$/);
  if (n) return { gbStr: `${n[1]}GB`, isUnlimited: false };
  return { gbStr: name, isUnlimited: false };
}

// ─── VIMLA (uses GTM ecommerce data embedded in HTML) ─────────────────────────
export async function fetchVimla(): Promise<OperatorPrices> {
  const base: OperatorPrices = {
    id: "vimla",
    name: "Vimla",
    parentOperator: "telenor",
    plans: [],
    lastUpdated: new Date().toISOString(),
    isLive: true,
    error: null,
  };

  try {
    const html = await fetchHtml("https://vimla.se/");
    if (html.length < 5000) {
      base.error = "Besök vimla.se för aktuella priser";
      return base;
    }

    // Try GTM ecommerce items first (most reliable)
    const gtmItems = extractGtmEcommerceItems(html);
    if (gtmItems.length > 0) {
      const seen = new Set<string>();
      for (const item of gtmItems) {
        const { gbStr, isUnlimited } = parseGbFromName(item.name);
        if (!seen.has(gbStr)) {
          seen.add(gbStr);
          base.plans.push({
            name: `Vimla ${gbStr}`,
            dataAmount: gbStr,
            dataGb: isUnlimited ? null : parseGb(gbStr),
            price: item.price,
            originalPrice: null,
            isUnlimited,
          });
        }
      }
    }

    // Fallback: regex extraction
    if (base.plans.length === 0) {
      const pairs = extractGbPricePairs(html, {
        maxGb: 500,
        minPrice: 80,
        maxPrice: 600,
        windowChars: 1000,
      });
      const valid = pairs.filter((p) => p.price >= 80);
      base.plans = valid.map((p) => makePlan("Vimla", p.gbStr, p.price));
    }

    base.plans = sortPlans(base.plans);

    if (base.plans.length === 0) {
      base.error = "Besök vimla.se för aktuella priser";
    }
  } catch {
    base.error = "Besök vimla.se för aktuella priser";
  }

  return base;
}
