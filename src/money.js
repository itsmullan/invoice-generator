'use strict';
// All money is stored as integer minor units (cents). Quantities are stored in
// thousandths so "1.5 hours" is exact. Rates are stored in basis points (1% = 100).

const CURRENCIES = {
  USD: 2, EUR: 2, GBP: 2, CAD: 2, AUD: 2, NZD: 2, CHF: 2, INR: 2, SGD: 2, AED: 2, ZAR: 2, BRL: 2, MXN: 2, SEK: 2, NOK: 2, DKK: 2, PLN: 2, JPY: 0,
};
const exponent = (cur) => CURRENCIES[cur] ?? 2;

/** Pure integer math (no float drift): round-half-up of a*b/div for non-negative ints. */
const mulDiv = (a, b, div) => Number((BigInt(a) * BigInt(b) * 2n + BigInt(div)) / (BigInt(div) * 2n));

function computeTotals({ items, discount_type, discount_value, tax_rate_bp }) {
  const lines = items.map((it) => mulDiv(it.unit_price_cents, it.quantity_milli, 1000));
  const subtotal = lines.reduce((a, b) => a + b, 0);
  let discount = 0;
  if (discount_type === 'percent') discount = mulDiv(subtotal, discount_value, 10000); // value in bp
  else if (discount_type === 'fixed') discount = Math.min(discount_value, subtotal);
  const taxable = subtotal - discount;
  const tax = mulDiv(taxable, tax_rate_bp, 10000);
  return { lines, subtotal_cents: subtotal, discount_cents: discount, tax_cents: tax, total_cents: taxable + tax };
}

function formatMoney(cents, currency, display = 'symbol') {
  const e = exponent(currency);
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency, currencyDisplay: display, minimumFractionDigits: e, maximumFractionDigits: e,
  }).format(cents / 10 ** e);
}

module.exports = { CURRENCIES, exponent, computeTotals, formatMoney, mulDiv };
