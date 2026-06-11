import React, { useState, useMemo } from "react";
import { useGetAllPrices, getGetAllPricesQueryKey } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, RefreshCw, Wifi, ExternalLink } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const OPERATOR_URLS: Record<string, string> = {
  tre: "https://www.tre.se",
  telia: "https://www.telia.se/privat/telefoni/mobiltelefoni/",
  fello: "https://fello.se/mobilabonnemang/",
  telenor: "https://www.telenor.se/mobilabonnemang/",
  vimla: "https://vimla.se/",
  tele2: "https://www.tele2.se/privat/",
  comviq: "https://www.comviq.se/mobilabonnemang",
};

const OPERATOR_COLORS: Record<string, string> = {
  tre: "bg-[#005B99] text-white",
  telia: "bg-[#990AE3] text-white",
  fello: "bg-[#FF4B7E] text-white",
  halebop: "bg-[#000000] text-[#00FF00]",
  telenor: "bg-[#00A9CE] text-white",
  vimla: "bg-[#FF4F00] text-white",
  tele2: "bg-[#EB2026] text-white",
  comviq: "bg-[#FF6600] text-white",
};

interface OperatorSelection {
  tre: string;
  teliaGroup: string;
  telenorGroup: string;
  tele2Group: string;
}

interface PlanPrice {
  name: string;
  dataAmount: string;
  dataGb: number | null;
  price: number;
  originalPrice: number | null;
  isUnlimited: boolean;
}

interface OperatorData {
  id: string;
  name: string;
  parentOperator: string | null;
  plans: PlanPrice[];
  lastUpdated: string;
  isLive: boolean;
  error: string | null;
}

/** Find the best matching plan for the selected data amount.
 *  Returns exact match first, then closest by GB, then cheapest if nothing else works. */
function findBestPlan(
  plans: PlanPrice[],
  selectedData: string
): { plan: PlanPrice; isExact: boolean; closestLabel: string | null } | null {
  if (!plans || plans.length === 0) return null;

  const isUnlimitedSelected =
    selectedData === "Obegränsad" || selectedData.toLowerCase().includes("obegr");

  // Exact match
  const exact = plans.find(
    (p) =>
      p.dataAmount === selectedData ||
      (isUnlimitedSelected && p.isUnlimited)
  );
  if (exact) return { plan: exact, isExact: true, closestLabel: null };

  if (isUnlimitedSelected) {
    // Selected unlimited but no unlimited plan — return most expensive (largest)
    const sorted = [...plans].sort((a, b) => (b.dataGb ?? 0) - (a.dataGb ?? 0));
    if (sorted[0]) {
      return { plan: sorted[0], isExact: false, closestLabel: sorted[0].dataAmount };
    }
  }

  const selectedGb = parseInt(selectedData.replace(/\D/g, "")) || 0;

  // Find closest plan (prefer equal or larger, then fall back to smaller)
  const withGb = plans.filter((p) => !p.isUnlimited && p.dataGb !== null);
  if (withGb.length === 0) {
    // Only unlimited plans available
    const unl = plans.find((p) => p.isUnlimited);
    if (unl) return { plan: unl, isExact: false, closestLabel: "Obegränsad" };
    return null;
  }

  // Sort by GB ascending
  const sorted = [...withGb].sort((a, b) => (a.dataGb ?? 0) - (b.dataGb ?? 0));

  // Find next larger or equal
  const larger = sorted.find((p) => (p.dataGb ?? 0) >= selectedGb);
  if (larger) return { plan: larger, isExact: false, closestLabel: larger.dataAmount };

  // Fall back to largest available
  const biggest = sorted[sorted.length - 1];
  // Also consider unlimited if it exists
  const unlPlan = plans.find((p) => p.isUnlimited);
  if (unlPlan && !biggest) return { plan: unlPlan, isExact: false, closestLabel: "Obegränsad" };
  if (unlPlan && biggest) {
    return { plan: unlPlan, isExact: false, closestLabel: "Obegränsad" };
  }
  if (biggest) return { plan: biggest, isExact: false, closestLabel: biggest.dataAmount };

  return null;
}

export default function Home() {
  const [selectedData, setSelectedData] = useState("Obegränsad");
  const [selection, setSelection] = useState<OperatorSelection>({
    tre: "tre",
    teliaGroup: "telia",
    telenorGroup: "telenor",
    tele2Group: "tele2",
  });

  const { data: allPrices, isLoading, error, refetch, isFetching } = useGetAllPrices({
    query: {
      refetchInterval: 5 * 60 * 1000,
      queryKey: getGetAllPricesQueryKey(),
    },
  });

  const handleGroupSelection = (group: keyof OperatorSelection, value: string) => {
    if (value) setSelection((prev) => ({ ...prev, [group]: value }));
  };

  const getOperatorData = (operatorId: string): OperatorData | null => {
    if (!allPrices) return null;
    return (allPrices.operators as OperatorData[]).find((o) => o.id === operatorId) ?? null;
  };

  const getCardData = (operatorId: string) => {
    const op = getOperatorData(operatorId);
    if (!op) return null;
    const match = findBestPlan(op.plans, selectedData);
    return { operator: op, match };
  };

  const currentCards = useMemo(() => {
    const ids = [
      selection.tre,
      selection.teliaGroup,
      selection.telenorGroup,
      selection.tele2Group,
    ];
    return ids.map((id) => getCardData(id));
  }, [allPrices, selection, selectedData]);

  const minPrice = useMemo(() => {
    const prices = currentCards
      .map((c) => c?.match?.plan?.price)
      .filter((p): p is number => typeof p === "number");
    return prices.length > 0 ? Math.min(...prices) : null;
  }, [currentCards]);

  const maxPrice = useMemo(() => {
    const prices = currentCards
      .map((c) => c?.match?.plan?.price)
      .filter((p): p is number => typeof p === "number");
    return prices.length > 0 ? Math.max(...prices) : null;
  }, [currentCards]);

  // Build the data amount toggle options from available plans + a curated list
  const CURATED_AMOUNTS = [
    "Obegränsad", "100GB", "50GB", "25GB", "20GB", "15GB", "12GB", "10GB", "5GB",
  ];

  const availableDataAmounts = useMemo(() => {
    if (!allPrices) return CURATED_AMOUNTS;
    const amounts = new Set<string>(CURATED_AMOUNTS);
    (allPrices.operators as OperatorData[]).forEach((op) => {
      op.plans.forEach((plan) => {
        if (plan.dataAmount) amounts.add(plan.dataAmount);
      });
    });
    return [...amounts].sort((a, b) => {
      if (a === "Obegränsad") return -1;
      if (b === "Obegränsad") return 1;
      const numA = parseInt(a.replace(/\D/g, "")) || 0;
      const numB = parseInt(b.replace(/\D/g, "")) || 0;
      return numB - numA;
    });
  }, [allPrices]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <Wifi className="w-6 h-6 text-blue-600 shrink-0" />
          <h1 className="text-2xl font-black tracking-tight mr-4">Mobilkollen</h1>
          <div className="flex-1 overflow-x-auto">
            <ToggleGroup
              type="single"
              value={selectedData}
              onValueChange={(val) => val && setSelectedData(val)}
              className="justify-start w-max gap-1"
            >
              {availableDataAmounts.map((amount) => (
                <ToggleGroupItem
                  key={amount}
                  value={amount}
                  className="font-bold text-sm h-9 px-4 rounded-full whitespace-nowrap data-[state=on]:bg-slate-900 data-[state=on]:text-white border border-slate-200 data-[state=on]:border-slate-900"
                >
                  {amount}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 mt-8 space-y-8">
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 flex items-center gap-2 text-red-700 text-sm font-medium">
            <AlertCircle className="w-4 h-4 shrink-0" />
            Kunde inte hämta priserna. Försök igen om en stund.
          </div>
        )}

        {/* Subtitle */}
        <div className="text-center">
          <h2 className="text-slate-600 text-sm font-medium">
            Jämför mobilabonnemang för{" "}
            <span className="font-bold text-slate-900">{selectedData}</span>
          </h2>
        </div>

        {/* 4 operator group columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* TRE */}
          <OperatorColumn label="TRE" showSingle>
            <PriceCard
              data={currentCards[0]}
              minPrice={minPrice}
              maxPrice={maxPrice}
              isLoading={isLoading}
              operatorKey="tre"
              selectedData={selectedData}
            />
          </OperatorColumn>

          {/* Telia group */}
          <OperatorColumn
            label="Telia"
            subOptions={[
              { label: "Telia", value: "telia" },
              { label: "Fello", value: "fello" },
            ]}
            selected={selection.teliaGroup}
            onSelect={(v) => handleGroupSelection("teliaGroup", v)}
          >
            <PriceCard
              data={currentCards[1]}
              minPrice={minPrice}
              maxPrice={maxPrice}
              isLoading={isLoading}
              operatorKey={selection.teliaGroup}
              selectedData={selectedData}
            />
          </OperatorColumn>

          {/* Telenor group */}
          <OperatorColumn
            label="Telenor"
            subOptions={[
              { label: "Telenor", value: "telenor" },
              { label: "Vimla", value: "vimla" },
            ]}
            selected={selection.telenorGroup}
            onSelect={(v) => handleGroupSelection("telenorGroup", v)}
          >
            <PriceCard
              data={currentCards[2]}
              minPrice={minPrice}
              maxPrice={maxPrice}
              isLoading={isLoading}
              operatorKey={selection.telenorGroup}
              selectedData={selectedData}
            />
          </OperatorColumn>

          {/* Tele2 group */}
          <OperatorColumn
            label="Tele2"
            subOptions={[
              { label: "Tele2", value: "tele2" },
              { label: "Comviq", value: "comviq" },
            ]}
            selected={selection.tele2Group}
            onSelect={(v) => handleGroupSelection("tele2Group", v)}
          >
            <PriceCard
              data={currentCards[3]}
              minPrice={minPrice}
              maxPrice={maxPrice}
              isLoading={isLoading}
              operatorKey={selection.tele2Group}
              selectedData={selectedData}
            />
          </OperatorColumn>
        </div>

        {/* Footer */}
        <div className="flex flex-col items-center gap-3 pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="font-bold gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            Uppdatera priser
          </Button>
          {allPrices && (
            <p className="text-xs text-slate-400">
              Senast uppdaterad:{" "}
              {new Date(allPrices.fetchedAt as string).toLocaleString("sv-SE")}
            </p>
          )}
          <p className="text-xs text-slate-400 text-center max-w-md">
            Priser hämtas direkt från operatörernas hemsidor. TRE-priser är hardkodade. Verifiera alltid aktuellt pris på respektive hemsida.
          </p>
        </div>
      </main>
    </div>
  );
}

function OperatorColumn({
  children,
  label,
  showSingle,
  subOptions,
  selected,
  onSelect,
}: {
  children: React.ReactNode;
  label: string;
  showSingle?: boolean;
  subOptions?: { label: string; value: string }[];
  selected?: string;
  onSelect?: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {showSingle ? (
        <div className="bg-slate-900 text-white text-center font-black text-sm py-2 px-4 rounded-xl">
          {label}
        </div>
      ) : (
        <div className="bg-slate-100 rounded-xl p-1 flex gap-1">
          {subOptions?.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onSelect?.(opt.value)}
              className={`flex-1 text-sm font-bold py-1.5 rounded-lg transition-all ${
                selected === opt.value
                  ? "bg-white shadow-sm text-slate-900"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}

function PriceCard({
  data,
  minPrice,
  maxPrice,
  isLoading,
  operatorKey,
  selectedData,
}: {
  data: { operator: OperatorData; match: ReturnType<typeof findBestPlan> } | null;
  minPrice: number | null;
  maxPrice: number | null;
  isLoading: boolean;
  operatorKey: string;
  selectedData: string;
}) {
  if (isLoading) {
    return (
      <Card className="p-6 h-[300px] flex flex-col justify-between border-slate-200 shadow-sm rounded-2xl">
        <Skeleton className="h-6 w-20 rounded-md" />
        <div className="space-y-2">
          <Skeleton className="h-14 w-28 rounded-md" />
          <Skeleton className="h-4 w-16 rounded-md" />
        </div>
        <Skeleton className="h-4 w-full rounded-md" />
      </Card>
    );
  }

  const colorClass = OPERATOR_COLORS[operatorKey] ?? "bg-slate-800 text-white";
  const opUrl = OPERATOR_URLS[operatorKey] ?? "#";
  const opName = data?.operator?.name ?? operatorKey.toUpperCase();

  // No plan found at all (scraping failed or no plans)
  if (!data?.match) {
    const hasError = data?.operator?.error;
    return (
      <Card className="p-6 h-[300px] flex flex-col items-center justify-center border-slate-200 shadow-sm rounded-2xl bg-white text-center text-slate-400 gap-3">
        <div className={`px-3 py-1 rounded-lg text-xs font-black uppercase ${colorClass}`}>
          {opName}
        </div>
        <p className="font-semibold text-slate-500 text-sm">
          {hasError ? "Kunde ej hämta" : "Plan saknas"}
        </p>
        <a
          href={opUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 font-medium"
        >
          Besök hemsidan <ExternalLink className="w-3 h-3" />
        </a>
      </Card>
    );
  }

  const { operator, match } = data;
  const { plan, isExact, closestLabel } = match;

  const isCheapest = minPrice !== null && plan.price === minPrice && minPrice !== maxPrice;
  const savings = maxPrice !== null && plan.price !== maxPrice ? maxPrice - plan.price : 0;

  return (
    <Card
      className={`relative p-6 h-[300px] flex flex-col justify-between border shadow-sm rounded-2xl bg-white overflow-hidden transition-all duration-300 ${
        isCheapest
          ? "border-emerald-400 ring-2 ring-emerald-200"
          : "border-slate-200"
      }`}
    >
      {isCheapest && (
        <div className="absolute top-0 left-0 right-0 bg-emerald-500 text-white text-[10px] font-black uppercase tracking-wider text-center py-1">
          Billigaste just nu
        </div>
      )}

      <div className={`flex justify-between items-start ${isCheapest ? "mt-5" : ""}`}>
        <div className={`px-3 py-1 rounded-lg text-sm font-black uppercase ${colorClass}`}>
          {operator.name}
        </div>
        {operator.isLive ? (
          <Badge
            variant="outline"
            className="text-[10px] text-emerald-600 bg-emerald-50 border-emerald-200 font-bold uppercase tracking-wider"
          >
            Live
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="text-[10px] text-slate-500 bg-slate-50 border-slate-200 font-bold uppercase tracking-wider"
          >
            Fast pris
          </Badge>
        )}
      </div>

      <div className="py-2">
        <div className="flex items-baseline gap-1">
          <span className="text-5xl font-black tracking-tighter text-slate-900">
            {plan.price}
          </span>
          <span className="text-lg font-bold text-slate-500">kr/mån</span>
        </div>
        {!isExact && closestLabel && (
          <p className="text-xs text-amber-600 font-semibold mt-1 flex items-center gap-1">
            <AlertCircle className="w-3 h-3 shrink-0" />
            Närmaste plan: {closestLabel}
          </p>
        )}
        {plan.originalPrice && plan.originalPrice > plan.price && (
          <p className="text-sm text-slate-400 line-through font-medium mt-1">
            Ord. {plan.originalPrice} kr/mån
          </p>
        )}
      </div>

      <div className="border-t border-slate-100 pt-3 space-y-2">
        {isCheapest ? (
          <p className="text-sm font-bold text-emerald-600">
            Billigaste alternativet!
            {savings > 0 && ` Spara ${savings} kr/mån`}
          </p>
        ) : savings > 0 ? (
          <p className="text-sm font-semibold text-slate-500">
            {savings} kr/mån dyrare än billigaste
          </p>
        ) : (
          <p className="text-sm text-slate-400 font-medium">Dyraste alternativet</p>
        )}
        <a
          href={opUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 font-medium"
        >
          Verifiera på {operator.name} <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </Card>
  );
}
