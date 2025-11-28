export interface ParsedSteamPrice {
  priceOriginal: number | null;
  priceFinal: number | null;
  discountPercent: number;
  isOnSale: boolean;
}

const centsToDollars = (value: number): number => {
  return value / 100;
};

const parseFormattedPrice = (formatted: unknown): number | null => {
  if (typeof formatted !== "string") return null;
  const sanitized = formatted.replace(/[^0-9.,-]/g, "").replace(/,/g, "");
  if (!sanitized) return null;
  const parsed = Number(sanitized);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseSteamMonetaryValue = (
  raw: unknown,
  formatted: unknown,
): number | null => {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return centsToDollars(raw);
  }
  const fallback = parseFormattedPrice(formatted);
  return fallback != null ? fallback : null;
};

export function parseSteamPriceOverview(
  priceOverview: any,
): ParsedSteamPrice {
  if (!priceOverview || typeof priceOverview !== "object") {
    return {
      priceOriginal: null,
      priceFinal: null,
      discountPercent: 0,
      isOnSale: false,
    };
  }

  const priceOriginal = parseSteamMonetaryValue(
    priceOverview.initial,
    priceOverview.initial_formatted,
  );
  const priceFinal = parseSteamMonetaryValue(
    priceOverview.final,
    priceOverview.final_formatted,
  );

  let discountPercent =
    typeof priceOverview.discount_percent === "number" &&
    Number.isFinite(priceOverview.discount_percent)
      ? priceOverview.discount_percent
      : 0;

  if (
    priceOriginal != null &&
    priceFinal != null &&
    priceOriginal > 0 &&
    priceOriginal > priceFinal
  ) {
    const computed = Math.round(
      ((priceOriginal - priceFinal) / priceOriginal) * 100,
    );
    if (computed > discountPercent) {
      discountPercent = computed;
    }
  }

  discountPercent = Math.max(0, Math.min(100, discountPercent));

  return {
    priceOriginal,
    priceFinal,
    discountPercent,
    isOnSale: discountPercent > 0 && priceFinal != null,
  };
}
