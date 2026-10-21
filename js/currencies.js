// Currency metadata: which codes we offer, their names, flags and number formatting.

export const METALS = {
  XAU: { name: 'Gold', symbol: 'Au', unit: 'troy oz' },
  XAG: { name: 'Silver', symbol: 'Ag', unit: 'troy oz' },
  XPT: { name: 'Platinum', symbol: 'Pt', unit: 'troy oz' },
  XPD: { name: 'Palladium', symbol: 'Pd', unit: 'troy oz' },
};

// Active ISO 4217 currencies. The list shown to the user is this, filtered to
// codes the rate source actually has.
const FIAT = `AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB
BRL BSD BTN BWP BYN BZD CAD CDF CHF CLP CNY COP CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB
EUR FJD FKP GBP GEL GGP GHS GIP GMD GNF GTQ GYD HKD HNL HTG HUF IDR ILS IMP INR IQD IRR ISK
JEP JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD
MMK MNT MOP MRU MUR MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN
PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SOS SRD SSP STN SVC SYP SZL THB TJS
TMT TND TOP TRY TTD TWD TZS UAH UGX USD UYU UZS VES VND VUV WST XAF XCD XCG XOF XPF YER ZAR
ZMW ZWG`.split(/\s+/);

// Most currency codes start with their country's ISO 3166 code; these don't.
const REGION_OVERRIDES = {
  EUR: 'european_union', XAF: 'cm', XOF: 'sn', XCD: 'ag', XPF: 'pf', ANG: 'cw', XCG: 'cw',
};

const NAME_OVERRIDES = {
  XCG: 'Caribbean Guilder', ZWG: 'Zimbabwe Gold', SLE: 'Sierra Leonean Leone',
  GGP: 'Guernsey Pound', JEP: 'Jersey Pound', IMP: 'Manx Pound', VES: 'Venezuelan Bolívar',
};

let displayNames;
try { displayNames = new Intl.DisplayNames(['en'], { type: 'currency' }); } catch { /* old Safari */ }

export function isMetal(code) {
  return code in METALS;
}

export function currencyName(code) {
  if (isMetal(code)) return METALS[code].name;
  if (NAME_OVERRIDES[code]) return NAME_OVERRIDES[code];
  const name = displayNames?.of(code);
  return name && name !== code ? name : code;
}

export function currencySubtitle(code) {
  return isMetal(code) ? `${METALS[code].name} · ${METALS[code].unit}` : currencyName(code);
}

// Circular flag artwork from HatScripts/circle-flags (MIT), vendored in icons/flags.
export function flagSrc(code) {
  const region = REGION_OVERRIDES[code] ?? code.slice(0, 2).toLowerCase();
  return `icons/flags/${region}.svg`;
}

// Returns the HTML for the round badge shown next to a currency.
export function badgeHTML(code) {
  if (isMetal(code)) {
    return `<span class="badge metal metal-${code.toLowerCase()}">${METALS[code].symbol}</span>`;
  }
  return `<img class="badge" src="${flagSrc(code)}" alt="" loading="lazy" decoding="async">`;
}

/** Codes to offer, given the set the rate source returned. Metals first. */
export function availableCodes(rates) {
  const metals = Object.keys(METALS).filter((c) => c in rates);
  const fiat = FIAT.filter((c) => c in rates);
  return { metals, fiat };
}

// ---- Number formatting ------------------------------------------------------

const locale = navigator.language || 'en-US';
const fmtCache = new Map();

function fmt(key, opts) {
  if (!fmtCache.has(key)) fmtCache.set(key, new Intl.NumberFormat(locale, opts));
  return fmtCache.get(key);
}

function minorDigits(code) {
  if (isMetal(code)) return 4;
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency: code })
      .resolvedOptions().maximumFractionDigits;
  } catch {
    return 2;
  }
}

/** Format an amount held in `code`, e.g. 1234.5 CAD -> "1,234.50". */
export function formatAmount(value, code) {
  if (!Number.isFinite(value)) return '';
  if (value !== 0 && Math.abs(value) < 1) {
    return fmt('sig4', { maximumSignificantDigits: 4 }).format(value);
  }
  const d = minorDigits(code);
  return fmt(`fixed${d}`, { minimumFractionDigits: d, maximumFractionDigits: d }).format(value);
}

/** Format an exchange rate with enough precision to be useful. */
export function formatRate(value) {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 100) return fmt('r2', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  if (Math.abs(value) >= 1) return fmt('r4', { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(value);
  return fmt('rsig', { maximumSignificantDigits: 5 }).format(value);
}

/** Format an axis tick so every label on the axis has the same number of decimals. */
export function formatTick(value, step) {
  let d = 0;
  while (d < 10 && Math.abs(Math.round(step * 10 ** d) - step * 10 ** d) > 1e-6) d++;
  return fmt(`tick${d}`, { minimumFractionDigits: d, maximumFractionDigits: d }).format(value);
}

export function formatPercent(value, { signed = true } = {}) {
  return fmt(`pct${signed}`, {
    style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: signed ? 'exceptZero' : 'auto',
  }).format(value);
}

/** Plain '.'-decimal, ungrouped number for the calculator, e.g. 1234.5 CAD -> "1234.5". */
export function plainAmount(value, code) {
  if (!Number.isFinite(value)) return '';
  const opts = value !== 0 && Math.abs(value) < 1
    ? { maximumSignificantDigits: 4 }
    : { maximumFractionDigits: minorDigits(code) };
  return new Intl.NumberFormat('en-US', { ...opts, useGrouping: false }).format(value);
}
