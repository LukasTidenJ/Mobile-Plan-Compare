import React, { useMemo, useState } from "react";
import {
  useGetAllPrices,
  getGetAllPricesQueryKey,
} from "@workspace/api-client-react";
import { AlertCircle, RefreshCw, Wifi } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface ApiPlan {
  name: string;
  dataAmount: string;
  dataGb?: number | null;
  price: number;
  originalPrice?: number | null;
  isUnlimited?: boolean;
}

interface ApiOperator {
  id: string;
  name: string;
  parentOperator?: string | null;
  plans: ApiPlan[];
  lastUpdated: string;
  isLive: boolean;
  extraUserPrice?: number | null;
  extraUserOnlyUnlimited?: boolean;
  error?: string | null;
}

interface MatchedPlan {
  plan: ApiPlan;
  isExact: boolean;
  closestLabel: string | null;
}

type GroupKey = "tre" | "telia" | "telenor" | "tele2";

const GROUPS: Array<{
  key: GroupKey;
  label: string;
  brandOptions: Array<{ label: string; value: string }>;
  accent: string;
}> = [
  {
    key: "tre",
    label: "3",
    brandOptions: [{ label: "3", value: "tre" }],
    accent: "border-sky-400",
  },
  {
    key: "telia",
    label: "Telia",
    brandOptions: [
      { label: "Telia", value: "telia" },
      { label: "Fello", value: "fello" },
    ],
    accent: "border-rose-400",
  },
  {
    key: "telenor",
    label: "Telenor",
    brandOptions: [
      { label: "Telenor", value: "telenor" },
      { label: "Vimla", value: "vimla" },
    ],
    accent: "border-cyan-400",
  },
  {
    key: "tele2",
    label: "Tele2",
    brandOptions: [
      { label: "Tele2", value: "tele2" },
      { label: "Comviq", value: "comviq" },
    ],
    accent: "border-orange-400",
  },
];

const DATA_CHOICES = [
  "Obegränsad",
  "100GB",
  "50GB",
  "25GB",
  "20GB",
  "15GB",
  "12GB",
  "10GB",
  "5GB",
];

function findBestPlan(
  plans: ApiPlan[],
  selectedData: string,
): MatchedPlan | null {
  if (!plans.length) return null;

  const wantsUnlimited =
    selectedData === "Obegränsad" ||
    selectedData.toLowerCase().includes("obegr");
  const exact = plans.find(
    (plan) =>
      plan.dataAmount === selectedData || (wantsUnlimited && plan.isUnlimited),
  );
  if (exact) return { plan: exact, isExact: true, closestLabel: null };

  if (wantsUnlimited) {
    const unlimited = plans.find((plan) => plan.isUnlimited);
    if (unlimited)
      return { plan: unlimited, isExact: false, closestLabel: "Obegränsad" };
  }

  const selectedGb = parseInt(selectedData.replace(/\D/g, "")) || 0;
  const withGb = plans.filter(
    (plan) => !plan.isUnlimited && plan.dataGb !== null,
  );
  if (!withGb.length) return null;

  const sorted = [...withGb].sort((a, b) => (a.dataGb ?? 0) - (b.dataGb ?? 0));
  const larger = sorted.find((plan) => (plan.dataGb ?? 0) >= selectedGb);
  if (larger)
    return { plan: larger, isExact: false, closestLabel: larger.dataAmount };

  const biggest = sorted[sorted.length - 1];
  return biggest
    ? { plan: biggest, isExact: false, closestLabel: biggest.dataAmount }
    : null;
}

function formatPrice(price: number) {
  return new Intl.NumberFormat("sv-SE").format(price);
}

export default function Home() {
  const [selectedData, setSelectedData] = useState("Obegränsad");
  const [selectedBrands, setSelectedBrands] = useState<
    Record<Exclude<GroupKey, "tre">, string>
  >({
    telia: "telia",
    telenor: "telenor",
    tele2: "tele2",
  });
  const [extraPeople, setExtraPeople] = useState<Record<GroupKey, number>>({
    tre: 0,
    telia: 0,
    telenor: 0,
    tele2: 0,
  });

  const {
    data: allPrices,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useGetAllPrices({
    query: {
      refetchInterval: 5 * 60 * 1000,
      queryKey: getGetAllPricesQueryKey(),
    },
  });

  const operators = (allPrices?.operators ?? []) as ApiOperator[];
  const operatorsById = useMemo(
    () => new Map(operators.map((operator) => [operator.id, operator])),
    [operators],
  );

  const getSelectedOperatorId = (groupKey: GroupKey) => {
    if (groupKey === "tre") return "tre";
    return selectedBrands[groupKey];
  };

  const cards = useMemo(() => {
    return GROUPS.map((group) => {
      const operatorId = getSelectedOperatorId(group.key);
      const operator = operatorsById.get(operatorId) ?? null;
      const match = operator
        ? findBestPlan(operator.plans, selectedData)
        : null;
      const supportsExtra = Boolean(
        operator?.extraUserPrice !== null &&
        operator?.extraUserPrice !== undefined &&
        (!operator.extraUserOnlyUnlimited || match?.plan.isUnlimited),
      );
      const extraCount = supportsExtra ? extraPeople[group.key] : 0;
      const basePrice = match?.plan.price ?? null;
      const totalPrice =
        basePrice !== null && operator?.extraUserPrice != null
          ? basePrice + extraCount * operator.extraUserPrice
          : basePrice;

      return {
        group,
        operator,
        match,
        supportsExtra,
        extraCount,
        totalPrice,
      };
    });
  }, [operatorsById, selectedBrands, selectedData, extraPeople]);

  const validTotals = cards
    .map((card) => card.totalPrice)
    .filter((price): price is number => typeof price === "number");
  const cheapestTotal = validTotals.length ? Math.min(...validTotals) : null;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.95),_rgba(241,245,249,1)_55%,_rgba(226,232,240,1))] text-slate-950">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white">
            <Wifi className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-black tracking-tight">Mobilplaner</h1>
            <p className="text-sm text-slate-500">
              Originalpriser, snabbt val av data, enkelt extra-person-stöd.
            </p>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
            />
            Uppdatera
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 pb-14">
        {error && (
          <div className="mb-5 flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Kunde inte hämta alla priser just nu.
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-500">
              Välj data
            </p>
            <h2 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">
              Jämför mobilabonnemang på sekunder
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Standardvalet är alltid obegränsad surf. För 3 ligger priserna
              fast, och de andra operatörerna visar sina originalpriser direkt
              från sajterna.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 rounded-3xl border border-slate-200 bg-white p-2 shadow-sm">
            {DATA_CHOICES.map((choice) => (
              <button
                key={choice}
                type="button"
                onClick={() => setSelectedData(choice)}
                className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                  selectedData === choice
                    ? "bg-slate-950 text-white shadow"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {choice}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-4">
          {cards.map(
            ({
              group,
              operator,
              match,
              supportsExtra,
              extraCount,
              totalPrice,
            }) => (
              <OperatorCard
                key={group.key}
                group={group}
                operator={operator}
                match={match}
                supportsExtra={supportsExtra}
                extraCount={extraCount}
                totalPrice={totalPrice}
                cheapestTotal={cheapestTotal}
                loading={isLoading}
                selectedData={selectedData}
                onBrandChange={(value) => {
                  if (group.key !== "tre") {
                    setSelectedBrands((prev) => ({
                      ...prev,
                      [group.key]: value,
                    }));
                  }
                }}
                onExtraChange={(nextCount) =>
                  setExtraPeople((prev) => ({
                    ...prev,
                    [group.key]: Math.max(0, Math.min(5, nextCount)),
                  }))
                }
              />
            ),
          )}
        </div>

        <div className="mt-6 flex flex-col items-center gap-2 text-center text-xs text-slate-500">
          <p>
            3:s priser och extra-person-fee är hårdkodade. Originalpris används
            för Telia, Fello, Telenor, Vimla, Tele2 och Comviq när sajten visar
            det.
          </p>
          {allPrices?.fetchedAt && (
            <p>
              Senast uppdaterad:{" "}
              {new Date(allPrices.fetchedAt as string).toLocaleString("sv-SE")}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

function OperatorCard({
  group,
  operator,
  match,
  supportsExtra,
  extraCount,
  totalPrice,
  cheapestTotal,
  loading,
  selectedData,
  onBrandChange,
  onExtraChange,
}: {
  group: (typeof GROUPS)[number];
  operator: ApiOperator | null;
  match: MatchedPlan | null;
  supportsExtra: boolean;
  extraCount: number;
  totalPrice: number | null;
  cheapestTotal: number | null;
  loading: boolean;
  selectedData: string;
  onBrandChange: (value: string) => void;
  onExtraChange: (nextCount: number) => void;
}) {
  if (loading) {
    return (
      <Card
        className={`rounded-[28px] border-2 ${group.accent} bg-white p-5 shadow-sm`}
      >
        <div className="space-y-3">
          <Skeleton className="h-9 w-28 rounded-full" />
          <Skeleton className="h-10 w-full rounded-2xl" />
          <Skeleton className="h-14 w-32 rounded-2xl" />
          <Skeleton className="h-4 w-3/4 rounded-full" />
          <Skeleton className="h-20 w-full rounded-2xl" />
        </div>
      </Card>
    );
  }

  const isCheapest =
    cheapestTotal !== null &&
    totalPrice !== null &&
    totalPrice === cheapestTotal;
  const brandOptions = group.brandOptions;
  const selectedBrand = operator?.id ?? group.key;
  const opName = operator?.name ?? group.label;
  const showBrandToggle = brandOptions.length > 1;

  return (
    <Card
      className={`relative overflow-hidden rounded-[28px] border-2 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.08)] ${
        isCheapest ? "ring-2 ring-emerald-200" : ""
      } ${group.accent}`}
    >
      {isCheapest && (
        <div className="absolute inset-x-0 top-0 bg-emerald-500 px-3 py-1 text-center text-[10px] font-black uppercase tracking-[0.26em] text-white">
          Billigast just nu
        </div>
      )}

      <div
        className={`flex items-start justify-between gap-3 ${isCheapest ? "pt-5" : ""}`}
      >
        <div>
          <div className="inline-flex rounded-full bg-slate-950 px-3 py-1 text-xs font-black uppercase tracking-[0.2em] text-white">
            {group.label}
          </div>
          <p className="mt-2 text-sm font-semibold text-slate-500">
            Originalpris från sajten
          </p>
        </div>
        <Badge
          variant="outline"
          className="border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-600"
        >
          {operator?.isLive ? "Hämtad" : "Hårdkodad"}
        </Badge>
      </div>

      {showBrandToggle && (
        <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
          {brandOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onBrandChange(option.value)}
              className={`rounded-xl px-3 py-2 text-sm font-bold transition ${
                selectedBrand === option.value
                  ? "bg-white text-slate-950 shadow"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      <div className="mt-5 space-y-1">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-500">
          Månadskostnad
        </p>
        <div className="flex items-end gap-2">
          <span className="text-5xl font-black tracking-tight text-slate-950">
            {totalPrice !== null ? formatPrice(totalPrice) : "0"}
          </span>
          <span className="pb-1 text-lg font-bold text-slate-500">kr/mån</span>
        </div>
        {match ? (
          <p className="text-sm text-slate-600">
            {match.isExact
              ? "Exakt match"
              : `Närmaste plan: ${match.closestLabel}`}
          </p>
        ) : (
          <p className="text-sm text-slate-600">
            Ingen prisdata hittades för den här operatören.
          </p>
        )}
      </div>

      <div className="mt-4 rounded-2xl bg-slate-50 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
              Vald plan
            </p>
            <p className="mt-1 text-lg font-black text-slate-950">
              {match?.plan.dataAmount ?? "Inget"}
            </p>
          </div>
          {match?.plan.isUnlimited ? (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-700">
              Obegränsad
            </span>
          ) : null}
        </div>

        {match?.plan && (
          <div className="mt-3 space-y-1 text-sm text-slate-600">
            <p>Baspris: {formatPrice(match.plan.price)} kr/mån</p>
            {match.plan.originalPrice ? (
              <p>
                Ordinarie pris: {formatPrice(match.plan.originalPrice)} kr/mån
              </p>
            ) : null}
          </div>
        )}
      </div>

      {supportsExtra && operator?.extraUserPrice ? (
        <div className="mt-4 rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
                Extra personer
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {formatPrice(operator.extraUserPrice)} kr per extra person
                {operator.extraUserOnlyUnlimited ? " på obegränsat" : ""}
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => onExtraChange(extraCount - 1)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg font-black text-slate-700 shadow-sm transition hover:text-slate-950"
              >
                -
              </button>
              <span className="min-w-8 text-center text-sm font-black text-slate-950">
                {extraCount}
              </span>
              <button
                type="button"
                onClick={() => onExtraChange(extraCount + 1)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg font-black text-slate-700 shadow-sm transition hover:text-slate-950"
              >
                +
              </button>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Lägg till personer utan att lämna prisjämförelsen.
          </p>
        </div>
      ) : operator?.id === "fello" || operator?.id === "vimla" ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
            Familjeabonnemang
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Inget familjeabonnemang — varje person behöver eget abonnemang.
          </p>
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4 text-sm">
        <div>
          <p className="font-bold text-slate-700">{opName}</p>
          <p className="text-xs text-slate-500">{operator?.error ?? "Redo"}</p>
        </div>
        {totalPrice !== null &&
        cheapestTotal !== null &&
        totalPrice !== cheapestTotal ? (
          <p className="text-xs font-semibold text-slate-500">
            {formatPrice(totalPrice - cheapestTotal)} kr dyrare
          </p>
        ) : (
          <p className="text-xs font-semibold text-emerald-600">
            Bästa priset just nu
          </p>
        )}
      </div>

      <p className="mt-3 text-xs leading-5 text-slate-500">
        {selectedData === "Obegränsad"
          ? "Standardvalet visar obegränsad surf och faller tillbaka till närmaste plan om en operatör saknar det."
          : `Visar närmaste plan för ${selectedData}.`}
      </p>
    </Card>
  );
}
