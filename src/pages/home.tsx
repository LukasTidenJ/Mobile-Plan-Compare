import React, { useMemo, useState } from "react";
import { getAllOperators, type OperatorPrices, type PlanPrice } from "../lib/operators";

interface ApiOperator {
  id: string;
  name: string;
  parentOperator?: string | null;
  plans: PlanPrice[];
  lastUpdated: string;
  isLive: boolean;
  extraUserPrice?: number | null;
  extraUserOnlyUnlimited?: boolean;
  error?: string | null;
}

interface MatchedPlan {
  plan: PlanPrice;
  isExact: boolean;
  closestLabel: string | null;
}

type GroupKey = "tre" | "telia" | "telenor" | "tele2";

const GROUPS: Array<{
  key: GroupKey;
  label: string;
  brandOptions: Array<{ label: string; value: string }>;
}> = [
  {
    key: "tre",
    label: "3",
    brandOptions: [{ label: "3", value: "tre" }],
  },
  {
    key: "telia",
    label: "Telia",
    brandOptions: [
      { label: "Telia", value: "telia" },
      { label: "Fello", value: "fello" },
    ],
  },
  {
    key: "telenor",
    label: "Telenor",
    brandOptions: [
      { label: "Telenor", value: "telenor" },
      { label: "Vimla", value: "vimla" },
    ],
  },
  {
    key: "tele2",
    label: "Tele2",
    brandOptions: [
      { label: "Tele2", value: "tele2" },
      { label: "Comviq", value: "comviq" },
    ],
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
  plans: PlanPrice[],
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
  const [selectedData, setSelectedData] = useState<Record<GroupKey, string>>({
    tre: "Obegränsad",
    telia: "Obegränsad",
    telenor: "Obegränsad",
    tele2: "Obegränsad",
  });
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
  const [selectedBroadband, setSelectedBroadband] = useState<string>("none");

  const operators = getAllOperators() as ApiOperator[];
  const isLoading = false;
  const error = null;
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
        ? findBestPlan(operator.plans, selectedData[group.key])
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
    <div className="container">
      <header className="header">
        <h1>Mobilplaner</h1>
        <p>Jämför mobilabonnemang</p>
        <a
          href="https://www.tre.se/varfor-tre/tackning/tackningskarta"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-block',
            marginTop: '16px',
            padding: '12px 24px',
            background: '#3b82f6',
            color: '#fff',
            textDecoration: 'none',
            borderRadius: '8px',
            fontWeight: '600',
            transition: 'all 0.2s'
          }}
          onMouseOver={(e) => e.currentTarget.style.background = '#2563eb'}
          onMouseOut={(e) => e.currentTarget.style.background = '#3b82f6'}
        >
          Se täckningskarta
        </a>
      </header>

      <main>
        <div className="grid">
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
                selectedData={selectedData[group.key]}
                onBrandChange={(value) => {
                  if (group.key !== "tre") {
                    setSelectedBrands((prev) => ({
                      ...prev,
                      [group.key]: value,
                    }));
                  }
                }}
                onDataChange={(value) => {
                  setSelectedData((prev) => ({
                    ...prev,
                    [group.key]: value,
                  }));
                }}
                selectedBroadband={selectedBroadband}
                onBroadbandChange={setSelectedBroadband}
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

        <div className="footer">
          <p>Alla priser är uppdaterade manuellt baserat på operatörernas officiella prislistor.</p>
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
  selectedData,
  onBrandChange,
  onExtraChange,
  onDataChange,
  selectedBroadband,
  onBroadbandChange,
}: {
  group: (typeof GROUPS)[number];
  operator: ApiOperator | null;
  match: MatchedPlan | null;
  supportsExtra: boolean;
  extraCount: number;
  totalPrice: number | null;
  cheapestTotal: number | null;
  selectedData: string;
  onBrandChange: (value: string) => void;
  onExtraChange: (nextCount: number) => void;
  onDataChange: (value: string) => void;
  selectedBroadband: string;
  onBroadbandChange: (value: string) => void;
}) {
  const isCheapest =
    cheapestTotal !== null &&
    totalPrice !== null &&
    totalPrice === cheapestTotal;
  const brandOptions = group.brandOptions;
  const selectedBrand = operator?.id ?? group.key;
  const opName = operator?.name ?? group.label;
  const showBrandToggle = brandOptions.length > 1;
  const availablePlans = operator?.plans.map(p => p.dataAmount) || [];

  return (
    <div className={`card ${group.key}`}>
      <div className="card-header">
        <h3 className="card-title">{group.label}</h3>
      </div>

      <div className="data-selector" style={{marginBottom: '16px'}}>
        {availablePlans.map((plan) => (
          <button
            key={plan}
            type="button"
            onClick={() => onDataChange(plan)}
            className={`data-btn ${selectedData === plan ? 'active' : ''}`}
            style={{padding: '8px 16px', fontSize: '0.875rem'}}
          >
            {plan}
          </button>
        ))}
      </div>

      {showBrandToggle && (
        <div className="brand-toggle">
          {brandOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onBrandChange(option.value)}
              className={`brand-btn ${selectedBrand === option.value ? 'active' : ''}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      <div className="price-display">
        <span className="price-large">
          {totalPrice !== null ? formatPrice(totalPrice) : "0"}
        </span>
        <span className="price-unit">kr/mån</span>
      </div>

      <div className="plan-info">
        <div className="plan-name">
          {match?.plan.dataAmount ?? "Inget"}
          {match?.plan.isUnlimited && (
            <span className="badge" style={{marginLeft: '8px'}}>Obegränsad</span>
          )}
        </div>
        <div className="plan-details">
          Baspris: {match?.plan.price ? formatPrice(match.plan.price) : "0"} kr/mån
        </div>
      </div>

      {group.key === "tre" && (
        <div className="plan-info">
          <div className="form-label">Bredband</div>
          <select
            className="form-select"
            value={selectedBroadband}
            onChange={(e) => onBroadbandChange(e.target.value)}
          >
            <option value="none">Inget bredband</option>
            <option value="new">Ny kund: 1000/1000 + router 5 lax (399 kr)</option>
            <option value="existing">Existerande kund: 1000/1000 + router 5 lax (299 kr)</option>
          </select>
        </div>
      )}

      {supportsExtra && operator?.extraUserPrice ? (
        <div className="extra-users">
          <div className="extra-users-header">
            <div>
              <div className="form-label">Extra personer</div>
              <div style={{fontSize: '0.875rem', color: '#888'}}>
                {formatPrice(operator.extraUserPrice)} kr/person
              </div>
            </div>
            <div className="extra-users-controls">
              <button
                type="button"
                onClick={() => onExtraChange(extraCount - 1)}
                className="extra-btn"
              >
                -
              </button>
              <span className="extra-count">{extraCount}</span>
              <button
                type="button"
                onClick={() => onExtraChange(extraCount + 1)}
                className="extra-btn"
              >
                +
              </button>
            </div>
          </div>
        </div>
      ) : operator?.id === "fello" || operator?.id === "vimla" ? (
        <div className="plan-info">
          <div className="plan-details">
            Inget familjeabonnemang — varje person behöver eget abonnemang.
          </div>
        </div>
      ) : null}

      <div className="card-footer">
        <div className="operator-name">{opName}</div>
        {group.key === "tre" && totalPrice !== null && cheapestTotal !== null && totalPrice > cheapestTotal ? (
          <div className="savings worse">
            Sparar {formatPrice(totalPrice - cheapestTotal)} kr med 3
          </div>
        ) : totalPrice !== null &&
        cheapestTotal !== null &&
        totalPrice !== cheapestTotal ? (
          <div className="savings worse">
            +{formatPrice(totalPrice - cheapestTotal)} kr
          </div>
        ) : (
          <div className="savings best">Bästa pris</div>
        )}
      </div>
    </div>
  );
}
