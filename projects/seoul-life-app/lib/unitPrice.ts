// Unit prices are computed in code, never by the model.

export type PricedItem = {
  price_krw?: number | null;
  size_amount?: number | null;
  size_unit?: string | null;
  promo?: string | null;
};

function promoFactor(promo?: string | null): number {
  if (!promo) return 1;
  const m = promo.replace(/\s/g, "").match(/(\d+)\+(\d+)/);
  if (!m) return 1;
  const pay = Number(m[1]);
  const free = Number(m[2]);
  if (!pay || pay + free === 0) return 1;
  return pay / (pay + free);
}

export function unitPriceText(item: PricedItem): string | null {
  const price = Number(item.price_krw);
  const amount = Number(item.size_amount);
  if (!price || !amount || price <= 0 || amount <= 0) return null;
  const unit = (item.size_unit || "").toLowerCase().trim();
  const effective = price * promoFactor(item.promo);
  const won = (n: number) => `${Math.round(n).toLocaleString("en-US")}韩元`;
  const promoNote = promoFactor(item.promo) < 1 ? `（按 ${item.promo} 折算）` : "";

  if (unit === "g") return `每 100g ${won((effective / amount) * 100)}${promoNote}`;
  if (unit === "kg") return `每 100g ${won(effective / amount / 10)}${promoNote}`;
  if (unit === "ml") return `每 100ml ${won((effective / amount) * 100)}${promoNote}`;
  if (unit === "l") return `每 100ml ${won(effective / amount / 10)}${promoNote}`;
  if (unit) return `每${item.size_unit} ${won(effective / amount)}${promoNote}`;
  return null;
}
