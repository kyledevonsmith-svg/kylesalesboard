// Reads the plans each retailer publishes for customers to join.
// Supply and usage in that feed are dollars excluding GST. The website and the quote show them including GST, so prices are multiplied by 1.1.
// Feed-in credits are not. A rate that cannot be shown as one number is left out.
import { writeFileSync } from "node:fs";

const BRANDS = [
  { id: "dodo", brand: "dodo", site: "https://www.dodo.com/energy", standingSite: "https://www.dodo.com/price_var" },
  { id: "first", brand: "1st-energy", site: "https://www.1stenergy.com.au/" },
  { id: "alinta", brand: "alinta", site: "https://www.alintaenergy.com.au/residential/electricity-and-gas/" },
  { id: "agl", brand: "agl", site: "https://www.agl.com.au/residential/energy/compare-plans" },
  { id: "engie", brand: "engie", site: "https://engie.com.au/residential/electricity-and-gas-plans/compare-electricity-and-gas-plans" },
  { id: "momentum", brand: "momentum", site: "https://www.momentumenergy.com.au/" },
  { id: "bluenrg", brand: "blue-nrg", site: "https://www.bluenrg.com.au/" },
  { id: "nextbusiness", brand: "next-business", site: "https://www.nextbusinessenergy.com.au/" }
];

const NETWORKS = {
  ausgrid: "ausgrid",
  endeavour: "endeavour",
  "endeavour energy": "endeavour",
  essential: "essential",
  "essential energy": "essential",
  energex: "energex",
  "sa power networks": "sapn",
  sapn: "sapn",
  ausnet: "ausnet",
  "ausnet services": "ausnet",
  "ausnet services (electricity)": "ausnet",
  "ausnet electricity services": "ausnet",
  "essential energy standard": "essential",
  citipower: "citipower",
  jemena: "jemena",
  powercor: "powercor",
  "united energy": "united",
  evoenergy: "evoenergy",
  actewagl: "evoenergy",
  tasnetworks: "tasnetworks",
  "ergon energy": "ergon-net",
  ergon: "ergon-net"
};

function incCents(dollars) {
  const n = Number(dollars);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 11000) / 100;
}

function fitCents(dollars) {
  const n = Number(dollars);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10000) / 100;
}

function clock(value, isEnd) {
  const parts = String(value || "").split(":");
  let hour = Number(parts[0]);
  let minute = Number(parts[1] || 0);
  if (!Number.isFinite(hour)) return "";
  if (isEnd && minute >= 59) hour += 1;
  if (hour === 24) return "12am";
  const suffix = hour >= 12 ? "pm" : "am";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return hour12 + suffix;
}

function daysLabel(days) {
  const set = (days || []).map((day) => String(day).toUpperCase());
  const week = ["MON", "TUE", "WED", "THU", "FRI"];
  const all = week.concat(["SAT", "SUN"]);
  if (all.every((day) => set.includes(day))) return "every day";
  if (week.every((day) => set.includes(day)) && set.length === 5) return "weekdays";
  if (set.length === 2 && set.includes("SAT") && set.includes("SUN")) return "weekends";
  return set.join(", ");
}

function windowText(band) {
  return (band.timeOfUse || []).map((slot) => {
    const start = clock(slot.startTime, false);
    const end = clock(slot.endTime, true);
    const days = daysLabel(slot.days);
    if (!start || !end) return "";
    return start + "–" + end + (days ? " " + days : "");
  }).filter(Boolean).join("; ");
}

function priceOf(block) {
  const rates = block && block.rates || [];
  if (!rates.length) return null;
  const prices = rates.map((rate) => incCents(rate.unitPrice));
  if (prices.some((price) => price == null)) return null;
  if (prices.some((price) => price !== prices[0])) return { stepped: true };
  return { price: prices[0] };
}

function periodSignature(period) {
  return JSON.stringify({
    supply: period.dailySupplyCharge,
    single: period.singleRate && period.singleRate.rates,
    tou: (period.timeOfUseRates || []).map((band) => [band.type, band.rates]),
    demand: period.demandCharges || []
  });
}

function fitFor(contract) {
  const tariffs = contract.solarFeedInTariff || [];
  const retailer = tariffs.find((item) => item.payerType === "RETAILER" && item.singleTariff && item.singleTariff.rates && item.singleTariff.rates.length === 1);
  const chosen = retailer || tariffs.find((item) => item.singleTariff && item.singleTariff.rates && item.singleTariff.rates.length === 1);
  if (!chosen) return null;
  return fitCents(chosen.singleTariff.rates[0].unitPrice);
}

function demandDailyCents(period) {
  const charges = period.demandCharges || [];
  if (!charges.length) return { present: false };
  if (charges.length !== 1) return { present: true, unsupported: true };
  const charge = charges[0];
  const label = (charge.displayName || "") + " " + (charge.description || "");
  const unit = String(charge.measureUnit || "").toUpperCase();
  const perKw = unit === "KW" || unit === "KVA" || /kw/i.test(label);
  if (!perKw) return { present: true, unsupported: true };
  const amount = Number(charge.amount);
  if (!Number.isFinite(amount)) return { present: true, unsupported: true };
  return { present: true, cents: Math.round(amount * 11000) / 100 };
}

function describe(summary, detail) {
  const contract = detail.electricityContract;
  if (!contract || !contract.tariffPeriod || !contract.tariffPeriod.length) return null;
  const signatures = new Set(contract.tariffPeriod.map(periodSignature));
  if (signatures.size !== 1) return null;
  const period = contract.tariffPeriod[0];
  const rates = { supply: incCents(period.dailySupplyCharge) };
  if (rates.supply == null) return null;
  const bands = period.timeOfUseRates || [];
  const known = { PEAK: "peak", OFF_PEAK: "offpeak", OFFPEAK: "offpeak", SHOULDER: "shoulder", SOLAR_SOAK: "soak", SOLAR_SPONGE: "soak" };
  let free = "";
  const windows = [];
  for (const band of bands) {
    const type = String(band.type || "").toUpperCase();
    const priced = priceOf(band);
    if (!priced || priced.stepped) return null;
    if (type === "SHOULDER1" && priced.price === 0) {
      const when = windowText(band);
      free = "Free usage" + (when ? " " + when : "") + ", at 0c. Other charges still apply.";
      continue;
    }
    const key = known[type];
    if (!key) return null;
    if (rates[key] != null && rates[key] !== priced.price) return null;
    rates[key] = priced.price;
    const when = windowText(band);
    windows.push(key + (when ? " " + when : ""));
  }
  if (period.singleRate) {
    const priced = priceOf(period.singleRate);
    if (!priced || priced.stepped) return null;
    if (!bands.length) rates.usage = priced.price;
  }
  const loads = period.controlledLoad || [];
  loads.forEach((load, index) => {
    const block = load.singleRate || load;
    const priced = priceOf(block);
    if (!priced || priced.stepped) return;
    const key = index === 0 ? "cl1" : "cl2";
    rates[key] = priced.price;
    if (load.dailySupplyCharge != null) rates.clSupply = incCents(load.dailySupplyCharge);
  });
  if (rates.cl1 != null && rates.clSupply == null) rates.clSupply = 0;
  const demand = demandDailyCents(period);
  if (demand.unsupported) return null;
  if (demand.present) rates.demand = demand.cents;
  const fit = fitFor(contract);
  if (fit != null) rates.fit = fit;
  const customer = summary.customerType === "BUSINESS" ? "business" : summary.customerType === "RESIDENTIAL" ? "residential" : "";
  if (!customer) return null;
  const business = customer === "business";
  let tariffs = [];
  if (rates.usage != null && rates.peak == null) {
    tariffs = demand.present
      ? [business ? "biz-demand-single" : "demand-single"]
      : [business ? "biz-single" : "single"];
    if (!demand.present && rates.cl1 != null && !business) tariffs.push("controlled");
    if (fit != null && !demand.present && !business) tariffs.push("solar");
  } else if (rates.peak != null && rates.shoulder != null && rates.offpeak != null && rates.soak == null) {
    tariffs = [business ? "biz-tou" : "tou"];
    if (fit != null && !business) tariffs.push("solar-tou");
    if (demand.present && business) tariffs = ["biz-demand"];
    if (demand.present && !business) return null;
  } else if (rates.peak != null && rates.offpeak != null && rates.shoulder == null && rates.soak == null) {
    if (demand.present) return null;
    tariffs = [business ? "biz-two" : "tou-two"];
    if (fit != null && !business) tariffs.push("solar-two");
  } else if (rates.peak != null && rates.offpeak != null && rates.soak != null && rates.shoulder == null) {
    if (demand.present || business) return null;
    tariffs = ["tou-soak"];
    if (fit != null) tariffs.push("solar-soak");
  } else return null;
  let name = summary.displayName || "Published plan";
  if (rates.cl1 != null && !/control/i.test(name)) name += " + controlled load";
  const distributors = (summary.geography && summary.geography.distributors || []).map((item) => NETWORKS[String(item).trim().toLowerCase()]).filter(Boolean);
  if (!distributors.length) return { unknown: (summary.geography && summary.geography.distributors || []).join(", ") };
  const sourceUrl = summary.type === "STANDING" && BRANDS.find((item) => item.id === summary.retailerId).standingSite || summary.site;
  return distributors.map((network) => ({
    id: [summary.retailerId, summary.planId, network].join("-").toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    retailerId: summary.retailerId,
    name,
    offer: summary.type === "STANDING" ? "standing" : "market",
    customer,
    fuel: "electricity",
    network,
    tariffs,
    rates,
    windows: [free].concat(windows).filter(Boolean).join(". "),
    sourceUrl,
    planId: summary.planId,
    effective: String(summary.effectiveFrom || "").slice(0, 10)
  }));
}

async function getJson(url, version) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(url, { headers: { "x-v": version, Accept: "application/json", "User-Agent": "Mozilla/5.0" } });
    if (response.ok) return response.json();
    last = response.status + " " + url;
    if (response.status !== 429 && response.status < 500) break;
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  throw new Error(last);
}

async function listBrand(brand) {
  const plans = [];
  let page = 1;
  let pages = 1;
  while (page <= pages) {
    const body = await getJson("https://cdr.energymadeeasy.gov.au/" + brand.brand + "/cds-au/v1/energy/plans?fuelType=ELECTRICITY&type=ALL&effective=CURRENT&page-size=1000&page=" + page, "1");
    pages = body.meta.totalPages || 1;
    plans.push(...body.data.plans);
    page += 1;
  }
  return plans;
}

async function pool(items, limit, worker) {
  const output = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return output;
}

const summaries = [];
for (const brand of BRANDS) {
  const listed = await listBrand(brand);
  console.log(brand.id, listed.length);
  listed.forEach((plan) => summaries.push({
    retailerId: brand.id,
    site: brand.site,
    standingSite: brand.standingSite,
    brand: brand.brand,
    planId: plan.planId,
    displayName: plan.displayName,
    type: plan.type,
    customerType: plan.customerType,
    effectiveFrom: plan.effectiveFrom,
    geography: plan.geography
  }));
}

let done = 0;
const details = await pool(summaries, 16, async (summary) => {
  const detail = await getJson("https://cdr.energymadeeasy.gov.au/" + summary.brand + "/cds-au/v1/energy/plans/" + encodeURIComponent(summary.planId), "3");
  done += 1;
  if (done % 400 === 0) console.log("details", done, "/", summaries.length);
  return detail.data;
});

const plans = [];
const unknown = {};
let skipped = 0;
details.forEach((detail, index) => {
  const described = describe(summaries[index], detail);
  if (!described) {
    skipped += 1;
    return;
  }
  if (described.unknown) {
    unknown[described.unknown] = (unknown[described.unknown] || 0) + 1;
    return;
  }
  described.forEach((plan) => plans.push(plan));
});

const seen = new Set();
const unique = plans.filter((plan) => {
  const key = JSON.stringify([plan.retailerId, plan.network, plan.customer, plan.name, plan.tariffs, plan.rates]);
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
}).filter((plan) => {
  if (!/controlled load|\+ CL\b/i.test(plan.name)) return true;
  return !plans.some((other) => other !== plan && other.retailerId === plan.retailerId && other.network === plan.network && other.customer === plan.customer && !/controlled load|\+ CL\b/i.test(other.name) && other.rates.supply === plan.rates.supply && other.rates.usage === plan.rates.usage && other.rates.peak === plan.rates.peak && other.rates.shoulder === plan.rates.shoulder && other.rates.offpeak === plan.rates.offpeak && other.rates.demand === plan.rates.demand);
});

const retrieved = new Date().toISOString().slice(0, 10);
const body = `/* Generated by scripts/refresh-public-rates.mjs. Do not type rates in by hand. */
(function (root) {
  var PLANS = ${JSON.stringify(unique)};
  var RETRIEVED = ${JSON.stringify(retrieved)};

  function matching(retailerId, ctx) {
    if (!ctx) return [];
    return PLANS.filter(function (plan) {
      return plan.retailerId === retailerId && plan.network === ctx.network && plan.customer === ctx.customer && plan.fuel === ctx.fuel && plan.tariffs.indexOf(ctx.tariff) !== -1;
    });
  }

  function byId(id) {
    for (var i = 0; i < PLANS.length; i++) if (PLANS[i].id === id) return PLANS[i];
    return null;
  }

  function toBundle(plan, retailer) {
    return {
      retailerId: plan.retailerId,
      retailerName: retailer ? retailer.name : plan.retailerId,
      quoteUrl: plan.sourceUrl,
      planChoiceId: plan.id,
      planName: plan.name,
      variant: plan.offer,
      rates: plan.rates,
      windows: {},
      contract: plan.offer === "standing" ? "Standing offer published by the retailer." : "Market offer published by the retailer. A customer can ask for this plan by name.",
      termMonths: "None",
      exitNote: plan.windows || "",
      note: "GST inclusive. Read " + RETRIEVED + " from the rates " + (retailer ? retailer.name : "the retailer") + " publishes for customers to join.",
      verified: RETRIEVED
    };
  }

  root.QCPublic = { plans: PLANS, matching: matching, byId: byId, toBundle: toBundle, retrieved: RETRIEVED };
})(typeof globalThis !== "undefined" ? globalThis : this);
`;
writeFileSync(new URL("../quick-compare/public-plans.js", import.meta.url), body);
console.log("Wrote", unique.length, "plans from", summaries.length, "records.", skipped, "could not be shown as one rate.");
console.log("Unknown distributors", unknown);
