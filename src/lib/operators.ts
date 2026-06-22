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
  extraUserPrice: number | null;
  extraUserOnlyUnlimited: boolean;
  error: string | null;
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

function makeBaseOperator(
  id: string,
  name: string,
  parentOperator: string | null,
  isLive = false
): OperatorPrices {
  return {
    id,
    name,
    parentOperator,
    plans: [],
    lastUpdated: new Date().toISOString(),
    isLive,
    extraUserPrice: null,
    extraUserOnlyUnlimited: false,
    error: null,
  };
}

// ─── TRE (hardcoded) ────────────────────────────────────────────────────────────
export function fetchTre(): OperatorPrices {
  const base = makeBaseOperator("tre", "TRE", null, false);
  base.extraUserPrice = 129;
  base.extraUserOnlyUnlimited = false;
  base.plans = [
    makePlan("TRE", "Obegränsad", 299),
    makePlan("TRE", "50GB", 249),
    makePlan("TRE", "12GB", 219),
  ];
  return base;
}

// ─── COMVIQ (hardcoded) ───────────────────────────────────────────────────────────
export function fetchComviq(): OperatorPrices {
  const base = makeBaseOperator("comviq", "Comviq", "tele2", false);
  base.extraUserPrice = 149;
  base.extraUserOnlyUnlimited = false;
  base.plans = [
    makePlan("Comviq", "10GB", 129),
    makePlan("Comviq", "40GB", 229),
    makePlan("Comviq", "200GB", 359),
  ];
  return base;
}

// ─── TELE2 (hardcoded) ────────────────────────────────────────────────────────────
export function fetchTele2(): OperatorPrices {
  const base = makeBaseOperator("tele2", "Tele2", null, false);
  base.extraUserPrice = 249;
  base.extraUserOnlyUnlimited = false;
  base.plans = [
    makePlan("Tele2", "10GB", 299),
    makePlan("Tele2", "Obegränsad", 479),
    makePlan("Tele2", "Obegränsad Max", 519),
  ];
  return base;
}

// ─── TELIA (hardcoded) ────────────────────────────────────────────────────────────
export function fetchTelia(): OperatorPrices {
  const base = makeBaseOperator("telia", "Telia", null, false);
  base.extraUserPrice = 239;
  base.extraUserOnlyUnlimited = false;
  base.plans = [
    makePlan("Telia", "10GB", 299),
    makePlan("Telia", "20GB", 399),
    makePlan("Telia", "Obegränsad", 499),
  ];
  return base;
}

// ─── FELLO (hardcoded) ───────────────────────────────────────────────────────────
export function fetchFello(): OperatorPrices {
  const base = makeBaseOperator("fello", "Fello", "telia", false);
  base.extraUserPrice = null;
  base.extraUserOnlyUnlimited = false;
  base.plans = [
    makePlan("Fello", "5GB", 120),
    makePlan("Fello", "10GB", 180),
    makePlan("Fello", "20GB", 230),
    makePlan("Fello", "40GB", 290),
    makePlan("Fello", "100GB", 370),
  ];
  return base;
}

// ─── TELENOR (hardcoded) ─────────────────────────────────────────────────────────
export function fetchTelenor(): OperatorPrices {
  const base = makeBaseOperator("telenor", "Telenor", null, false);
  base.extraUserPrice = 249;
  base.extraUserOnlyUnlimited = false;
  base.plans = [
    makePlan("Telenor", "10GB", 299),
    makePlan("Telenor", "25GB", 399),
    makePlan("Telenor", "Obegränsad", 499),
    makePlan("Telenor", "Obegränsad Plus", 529),
  ];
  return base;
}

// ─── VIMLA (hardcoded) ───────────────────────────────────────────────────────────
export function fetchVimla(): OperatorPrices {
  const base = makeBaseOperator("vimla", "Vimla", "telenor", false);
  base.extraUserPrice = null;
  base.extraUserOnlyUnlimited = false;
  base.plans = [
    makePlan("Vimla", "10GB", 120),
    makePlan("Vimla", "20GB", 170),
    makePlan("Vimla", "30GB", 210),
    makePlan("Vimla", "50GB", 260),
    makePlan("Vimla", "200GB", 370),
  ];
  return base;
}

export function getAllOperators(): OperatorPrices[] {
  return [
    fetchTre(),
    fetchTelia(),
    fetchFello(),
    fetchTelenor(),
    fetchVimla(),
    fetchTele2(),
    fetchComviq(),
  ];
}
