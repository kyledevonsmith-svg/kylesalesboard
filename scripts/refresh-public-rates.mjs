// Reads prices a retailer publishes on their own site and writes quick-compare/public-plans.js.
// It does not invent a rate. A market offer that exists only inside an address quote is left out.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const NETWORKS = {
  "Ausgrid": "ausgrid",
  "Endeavour Energy": "endeavour",
  "Essential Energy": "essential",
  "Energex": "energex",
  "SA Power Networks": "sapn",
  "SAPN": "sapn",
  "AusNet Services": "ausnet",
  "CitiPower": "citipower",
  "Jemena": "jemena",
  "Powercor": "powercor",
  "United Energy": "united",
  "Evoenergy": "evoenergy",
  "TasNetworks": "tasnetworks"
};

const DODO = {
  retailerId: "dodo",
  url: "https://www.dodo.com/price_var",
  sections: [
    { customer: "residential", solar: false },
    { customer: "business", solar: false },
    { customer: "residential", solar: false },
    { customer: "residential", solar: false },
    { customer: "residential", solar: false },
    { customer: "business", solar: false },
    { customer: "residential", solar: true }
  ]
};

function cents(raw) {
  if (raw == null) return null;
  const text = String(raw).replace(/\s/g, "");
  if (!text || text === "-") return null;
  const n = Number(text.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100 * 1000) / 1000;
}

function cells(row) {
  return [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((match) =>
    match[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()
  );
}

function tables(html) {
  return [...html.matchAll(/<table[\s\S]*?<\/table>/gi)].map((match) => {
    const rows = [...match[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((row) => cells(row[0]));
    return rows.filter((row) => row.length);
  });
}

function classify(row, headers, section) {
  const value = {};
  headers.forEach((header, index) => { value[header] = row[index]; });
  const supply = cents(value["Daily Supply ($/day)"]);
  const peak = cents(value["Peak ($/kWh)"]);
  const shoulder = cents(value["Shoulder ($/kWh)"]);
  const offpeak = cents(value["Off-Peak ($/kWh)"]);
  const soak = cents(value["Solar Soak ($/kWh)"] ?? value["Solar Sponge / Soak ($/kWh)"]);
  const controlled = cents(value["Controlled Load ($/kWh)"]);
  const high = cents(value["High Season Peak ($/kWh)"]);
  const low = cents(value["Low Season Peak ($/kWh)"]);
  const network = NETWORKS[row[0]];
  const label = section.solar ? "Solar Sharer Offer" : (row[1] || "Standing offer");
  if (!network || supply == null) return null;
  if (high != null || low != null) return null;
  const rates = { supply };
  if (controlled != null) rates.cl1 = controlled;
  const hasControlled = /controlled load|\bCL\d?\b/i.test(label);
  let tariffs = [];
  let windows = "";
  if (section.solar) {
    if (peak == null) return null;
    rates.peak = peak;
    if (shoulder != null) rates.shoulder = shoulder;
    if (offpeak != null) rates.offpeak = offpeak;
    if (soak != null) rates.soak = soak;
    const free = value["Free Usage Period"];
    windows = free && free !== "-" ? "Free usage " + free + ", first 24 kWh a day at 0c. Other charges still apply." : "";
    tariffs = shoulder != null
      ? ["tou", "tou-soak", "solar-tou", "solar-soak"]
      : ["tou-two", "tou-soak", "solar-two", "solar-soak"];
  } else if (shoulder != null && offpeak != null && peak != null) {
    rates.peak = peak;
    rates.shoulder = shoulder;
    rates.offpeak = offpeak;
    tariffs = ["tou", "solar-tou"];
    windows = "Peak, shoulder and off-peak as published for this distributor.";
  } else if (peak != null && offpeak != null && soak != null) {
    rates.peak = peak;
    rates.offpeak = offpeak;
    rates.soak = soak;
    tariffs = ["tou-soak", "solar-soak"];
  } else if (peak != null && offpeak != null) {
    rates.peak = peak;
    rates.offpeak = offpeak;
    tariffs = ["tou-two", "solar-two"];
  } else if (peak != null) {
    rates.usage = peak;
    tariffs = ["single", "solar"];
  } else return null;
  if (hasControlled && !section.solar) {
    if (rates.usage == null && peak != null) rates.usage = peak;
    tariffs = ["controlled", "controlled-solar"];
  }
  if (section.customer === "business") {
    const map = { single: "biz-single", solar: "biz-single", tou: "biz-tou", "solar-tou": "biz-tou", "tou-two": "biz-two", "solar-two": "biz-two" };
    tariffs = tariffs.map((id) => map[id] || id).filter((id, index, list) => list.indexOf(id) === index && id.indexOf("biz-") === 0 || id === "controlled");
    tariffs = tariffs.filter((id) => id.indexOf("biz-") === 0);
    if (!tariffs.length) return null;
  }
  return {
    id: ["dodo", network, section.customer, section.solar ? "sharer" : label, supply].join("-").toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    retailerId: "dodo",
    name: section.solar ? "Solar Sharer Offer" : "Standing offer — " + label,
    offer: "standing",
    customer: section.customer,
    fuel: "electricity",
    network,
    tariffs,
    rates,
    windows,
    sourceUrl: DODO.url,
    effective: "2026-07-01"
  };
}

async function dodoPlans() {
  const response = await fetch(DODO.url, { headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html" } });
  if (!response.ok) throw new Error("Dodo price page " + response.status);
  const html = await response.text();
  const parsed = tables(html);
  if (parsed.length < DODO.sections.length) throw new Error("Dodo price page no longer has the expected tables");
  const plans = [];
  parsed.forEach((rows, index) => {
    const section = DODO.sections[index];
    if (!section) return;
    const headers = rows[0];
    rows.slice(1).forEach((row) => {
      const plan = classify(row, headers, section);
      if (plan) plans.push(plan);
    });
  });
  return plans;
}

const FIRST_PDFS = [
  { url: "https://public.1stenergy.com.au/1e-pdfs/2026/06/qld_standing_offers_20260701.pdf" },
  { url: "https://public.1stenergy.com.au/1e-pdfs/2026/06/nsw_standing_offers_20260701.pdf" },
  { url: "https://public.1stenergy.com.au/1e-pdfs/2026/06/sa_standing_offers_20260701.pdf", network: "sapn" }
];

const PDF_NETWORKS = {
  Energex: "energex",
  Ausgrid: "ausgrid",
  "Endeavour Energy": "endeavour",
  "Essential Energy": "essential",
  "SA Power Networks": "sapn"
};

function tariffsFor(customer, rates, title) {
  const controlled = /controlled load/i.test(title);
  const timeOfUse = /time of use/i.test(title);
  if (controlled && timeOfUse) return [];
  if (controlled) {
    if (customer !== "residential" || rates.usage == null || rates.cl1 == null || rates.cl2 != null) return [];
    return ["controlled"];
  }
  if (timeOfUse) {
    if (rates.peak == null || rates.offpeak == null || rates.supply == null) return [];
    if (rates.shoulder != null && rates.soak == null) return customer === "business" ? ["biz-tou"] : ["tou"];
    if (rates.soak != null && rates.shoulder == null) return customer === "residential" ? ["tou-soak"] : [];
    if (rates.shoulder == null && rates.soak == null) return customer === "business" ? ["biz-two"] : ["tou-two"];
    return [];
  }
  if (rates.usage == null || rates.supply == null) return [];
  return customer === "business" ? ["biz-single"] : ["single"];
}

function parseFirstText(text, source) {
  const plans = [];
  let network = source.network || null;
  let title = "";
  let rates = {};
  let blocked = false;
  function flush() {
    const tariffs = title && !blocked ? tariffsFor(/^business/i.test(title) ? "business" : "residential", rates, title) : [];
    if (network && tariffs.length) {
      const customer = tariffs[0].indexOf("biz-") === 0 ? "business" : "residential";
      plans.push({
        id: ["first", network, customer, title, rates.supply].join("-").toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        retailerId: "first",
        name: "Standing offer — " + title,
        offer: "standing",
        customer,
        fuel: "electricity",
        network,
        tariffs,
        rates,
        windows: "",
        sourceUrl: source.url,
        effective: "2026-07-01"
      });
    }
    title = "";
    rates = {};
    blocked = false;
  }
  text.split(/\n/).forEach((raw) => {
    const line = raw.replace(/\f/g, "").trim();
    if (!line || /standing offers|inclusive of gst|^\*|^effective /i.test(line)) return;
    if (PDF_NETWORKS[line]) {
      flush();
      network = PDF_NETWORKS[line];
      return;
    }
    const rate = line.match(/^(.*?)\s+([0-9]+(?:\.[0-9]+)?)\s+c\/(?:day|kWh)$/i);
    if (rate && title) {
      const label = rate[1].trim().toLowerCase();
      const amount = Number(rate[2]);
      if (label.includes(",") || label.includes("remaining") || label.includes("first ")) blocked = true;
      else if (label.startsWith("daily")) rates.supply = amount;
      else if (label.startsWith("anytime") || label.startsWith("general")) rates.usage = amount;
      else if (label.startsWith("off")) rates.offpeak = amount;
      else if (label.includes("shoulder")) rates.shoulder = amount;
      else if (label.includes("soak")) rates.soak = amount;
      else if (label.startsWith("peak")) rates.peak = amount;
      else if (label.includes("controlled load 2")) rates.cl2 = amount;
      else if (label.includes("controlled load")) rates.cl1 = amount;
      return;
    }
    flush();
    title = line;
  });
  flush();
  return plans;
}

async function pdfText(url) {
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/pdf" } });
  if (!response.ok) throw new Error("1st Energy price sheet " + response.status + " " + url);
  const file = join(mkdtempSync(join(tmpdir(), "rates-")), "sheet.pdf");
  writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  return execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8", maxBuffer: 8_000_000 });
}

async function firstPlans() {
  const plans = [];
  for (const source of FIRST_PDFS) {
    const text = await pdfText(source.url);
    const parsed = parseFirstText(text, source);
    if (!parsed.length) throw new Error("1st Energy price sheet had no readable plans: " + source.url);
    plans.push(...parsed);
  }
  return plans;
}

const retrieved = new Date().toISOString().slice(0, 10);
const plans = [...await dodoPlans(), ...await firstPlans()];
const body = `/* Generated by scripts/refresh-public-rates.mjs. Do not type rates in by hand. */
(function (root) {
  var PLANS = ${JSON.stringify(plans, null, 2)};
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
      quoteUrl: retailer && retailer.quoteUrl || plan.sourceUrl,
      planChoiceId: plan.id,
      planName: plan.name,
      rates: plan.rates,
      windows: {},
      contract: "Published standing offer. A market offer that is only shown after an address quote is not in this list.",
      termMonths: "None",
      exitNote: plan.windows || "No exit fee is listed on the published standing offer.",
      note: "Read from " + plan.sourceUrl + " on " + RETRIEVED + ". Effective " + plan.effective + ". These cents are on the retailer's published price page, GST inclusive.",
      verified: RETRIEVED
    };
  }

  root.QCPublic = { plans: PLANS, matching: matching, byId: byId, toBundle: toBundle, retrieved: RETRIEVED };
})(typeof globalThis !== "undefined" ? globalThis : this);
`;
writeFileSync(new URL("../quick-compare/public-plans.js", import.meta.url), body);
console.log("Wrote", plans.length, "published plans, retrieved", retrieved);
