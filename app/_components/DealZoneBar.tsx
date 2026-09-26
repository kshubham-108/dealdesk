"use client";

type Dot = { price: number; key: string };

export function DealZoneBar({
  asking,
  buyerLimit,
  sellerFloor,
  buyerOffers,
  sellerOffers,
  agreedPrice,
}: {
  asking: number;
  buyerLimit: number;
  sellerFloor: number | null;
  buyerOffers: Dot[];
  sellerOffers: Dot[];
  agreedPrice: number | null;
}) {
  const values = [
    asking,
    buyerLimit,
    sellerFloor ?? 0,
    agreedPrice ?? 0,
    ...buyerOffers.map((d) => d.price),
    ...sellerOffers.map((d) => d.price),
  ];
  const max = Math.max(...values) * 1.08;
  const pct = (v: number) => `${Math.min(100, Math.max(0, (v / max) * 100))}%`;

  const hasOverlap = sellerFloor != null && sellerFloor <= buyerLimit;

  return (
    <div className="mt-3">
      <div className="relative h-8 w-full rounded-full bg-zinc-100">
        {sellerFloor != null && (
          <div
            className={`absolute inset-y-0 rounded-full transition-all duration-500 ${
              hasOverlap ? "bg-emerald-100" : "bg-red-100"
            }`}
            style={{
              left: hasOverlap ? pct(sellerFloor) : pct(buyerLimit),
              right: hasOverlap ? `calc(100% - ${pct(buyerLimit)})` : `calc(100% - ${pct(sellerFloor)})`,
            }}
          />
        )}

        {/* Asking price tick */}
        <Marker pct={pct(asking)} color="bg-zinc-400" label={`Asking £${asking}`} />
        {/* Buyer limit lock */}
        <Marker pct={pct(buyerLimit)} color="bg-indigo-600" label={`Your limit £${buyerLimit}`} icon="🔒" />
        {/* Seller floor lock */}
        {sellerFloor != null && (
          <Marker pct={pct(sellerFloor)} color="bg-emerald-600" label={`Seller floor £${sellerFloor}`} icon="🔒" />
        )}

        {buyerOffers.map((d, i) => (
          <Dot key={d.key} pct={pct(d.price)} color="bg-blue-500" delay={i * 80} title={`You offered £${d.price}`} />
        ))}
        {sellerOffers.map((d, i) => (
          <Dot
            key={d.key}
            pct={pct(d.price)}
            color="bg-emerald-500"
            delay={i * 80}
            title={`Seller countered £${d.price}`}
          />
        ))}

        {agreedPrice != null && (
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 text-lg animate-[pop_0.4s_ease-out]"
            style={{ left: pct(agreedPrice) }}
            title={`Agreed £${agreedPrice}`}
          >
            ⭐
          </div>
        )}
      </div>

      {!hasOverlap && sellerFloor != null && (
        <p className="mt-1 text-xs font-medium text-red-600">no overlap</p>
      )}
    </div>
  );
}

function Marker({ pct, color, label, icon }: { pct: string; color: string; label: string; icon?: string }) {
  return (
    <div
      className="group absolute top-1/2 h-4 w-0.5 -translate-y-1/2 -translate-x-1/2"
      style={{ left: pct }}
    >
      <div className={`h-full w-full ${color}`} />
      <div className="pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
        {icon} {label}
      </div>
    </div>
  );
}

function Dot({ pct, color, delay, title }: { pct: string; color: string; delay: number; title: string }) {
  return (
    <div
      className={`absolute top-1/2 h-3 w-3 -translate-y-1/2 -translate-x-1/2 rounded-full ${color} animate-[pop_0.4s_ease-out_backwards]`}
      style={{ left: pct, animationDelay: `${delay}ms` }}
      title={title}
    />
  );
}
