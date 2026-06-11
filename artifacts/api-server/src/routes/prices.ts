import { Router } from "express";
import {
  fetchTre,
  fetchTelia,
  fetchFello,
  fetchTelenor,
  fetchVimla,
  fetchTele2,
  fetchComviq,
  type OperatorPrices,
} from "../lib/scraper.js";

const router = Router();

// In-memory cache: operator ID → { data, fetchedAt }
const cache = new Map<string, { data: OperatorPrices; fetchedAt: Date }>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

const FETCHERS: Record<string, () => Promise<OperatorPrices>> = {
  tre: fetchTre,
  telia: fetchTelia,
  fello: fetchFello,
  telenor: fetchTelenor,
  vimla: fetchVimla,
  tele2: fetchTele2,
  comviq: fetchComviq,
};

async function getOperatorWithCache(
  id: string
): Promise<OperatorPrices | null> {
  const fetcher = FETCHERS[id];
  if (!fetcher) return null;

  const cached = cache.get(id);
  if (cached && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS) {
    return cached.data;
  }

  const data = await fetcher();
  cache.set(id, { data, fetchedAt: new Date() });
  return data;
}

// GET /api/prices — all operators in parallel
router.get("/", async (_req, res) => {
  const ids = Object.keys(FETCHERS);
  const results = await Promise.allSettled(
    ids.map((id) => getOperatorWithCache(id))
  );

  const operators: OperatorPrices[] = results.map((r, i) => {
    if (r.status === "fulfilled" && r.value) return r.value;
    return {
      id: ids[i],
      name: ids[i],
      parentOperator: null,
      plans: [],
      lastUpdated: new Date().toISOString(),
      isLive: true,
      extraUserPrice: null,
      extraUserOnlyUnlimited: false,
      error: r.status === "rejected" ? String(r.reason) : "Okänt fel",
    };
  });

  res.json({
    operators,
    fetchedAt: new Date().toISOString(),
  });
});

// GET /api/prices/:operatorId
router.get("/:operatorId", async (req, res) => {
  const { operatorId } = req.params as { operatorId: string };
  const data = await getOperatorWithCache(operatorId);

  if (!data) {
    res.status(404).json({ error: "Operatör hittades inte" });
    return;
  }

  res.json(data);
});

export default router;
