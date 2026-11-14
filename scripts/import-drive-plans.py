#!/usr/bin/env python3
"""Add Drive plans that are not already in Quick Compare.

Existing plans are copied through unchanged, except residential Blue NRG,
which is removed. A component with more than one published figure is listed
on the plan and is not collapsed into the rate used for the year figure.
"""
import csv
import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLANS_JS = ROOT / "quick-compare" / "public-plans.js"
DRIVE_PLANS = Path("/tmp/plans.csv")
DRIVE_RATES = Path("/tmp/tariff_rates.csv")

BRANDS = {
    "1st-energy": "first",
    "dodo": "dodo",
    "alinta": "alinta",
    "agl": "agl",
    "engie": "engie",
    "momentum": "momentum",
    "blue-nrg": "bluenrg",
    "next-business": "nextbusiness",
}
SITES = {
    "dodo": "https://www.dodo.com/energy",
    "first": "https://www.1stenergy.com.au/",
    "alinta": "https://www.alintaenergy.com.au/residential/electricity-and-gas/",
    "agl": "https://www.agl.com.au/residential/energy/compare-plans",
    "engie": "https://engie.com.au/residential/electricity-and-gas-plans/compare-electricity-and-gas-plans",
    "momentum": "https://www.momentumenergy.com.au/",
    "bluenrg": "https://www.bluenrg.com.au/",
    "nextbusiness": "https://www.nextbusinessenergy.com.au/",
}
NETWORKS = {
    "ausgrid": "ausgrid",
    "endeavour": "endeavour",
    "endeavour energy": "endeavour",
    "essential energy": "essential",
    "essential energy standard": "essential",
    "essential energy far west": "essential",
    "energex": "energex",
    "ergon": "ergon-net",
    "ergon energy": "ergon-net",
    "sa power networks": "sapn",
    "citipower": "citipower",
    "ausnet services (electricity)": "ausnet",
    "ausnet services": "ausnet",
    "powercor": "powercor",
    "jemena": "jemena",
    "united energy": "united",
    "tasnetworks": "tasnetworks",
    "evoenergy": "evoenergy",
}
GAS_REGION = {
    "ausnet services (gas)": "VIC",
    "australian gas networks": "VIC",
    "multinet": "VIC",
    "jemena coastal network": "NSW",
    "jemena country network": "NSW",
    "agn albury": "NSW",
    "allgas energy nsw": "NSW",
    "agn wagga wagga": "NSW",
    "agn temora, culcairn, holbrook, henty and walla walla": "NSW",
    "agn murray valley (nsw)": "NSW",
    "jemena - capital region": "ACT",
    "agn metro/barossa/peterborough": "SA",
    "agn mount gambier": "SA",
    "agn port pirie": "SA",
    "agn riverland/murray bridge": "SA",
    "agn whyalla": "SA",
    "allgas energy qld": "QLD",
    "agn - brisbane and riverview": "QLD",
}


def cents(row):
    raw = row.get("price_inc_gst") or ""
    if raw == "":
        raw = row.get("price_as_published") or ""
        if raw == "":
            return None
    return round(float(raw) * 100, 2)


def bucket(row):
    name = (row.get("rate_name") or "") + " " + (row.get("rate_description") or "")
    low = name.lower()
    ct = row.get("component_type") or ""
    season = (row.get("season_name") or "").lower()
    if ct.startswith("SOLAR_FIT") or "feed-in" in low or "feed in" in low:
        if "government" in season or "bonus scheme" in low or "premium fit" in low:
            return "fitGov"
        return "fit"
    if ct.startswith("CONTROLLED") and "DAILY" in ct:
        return "cl2Supply" if re.search(r"\b2\b|cl2|tariff 33|tariff 61", low) else "clSupply"
    if ct.startswith("CONTROLLED") or "controlled load" in low:
        return "cl2" if re.search(r"\b2\b|cl2|tariff 33|tariff 61", low) else "cl1"
    if ct.startswith("DEMAND") or (ct == "DEMAND"):
        return "demand"
    if ct.startswith("DAILY_SUPPLY"):
        return "supply"
    if ct == "SINGLE_RATE":
        return "usage"
    if "free usage" in low:
        return "free"
    if re.search(r"off[-\s]?peak", low):
        return "offpeak"
    if "soak" in low or "sponge" in low:
        return "soak"
    if "shoulder" in low:
        return "shoulder"
    if re.search(r"\bpeak\b", low):
        return "peak"
    if ct == "SINGLE_RATE":
        return "usage"
    if ct == "OFF_PEAK":
        return "offpeak"
    if ct == "SHOULDER":
        return "shoulder"
    if ct in ("SOLAR_SOAK", "SOLAR_SPONGE"):
        return "soak"
    if ct == "PEAK":
        return "peak"
    return None


def load_existing():
    text = PLANS_JS.read_text()
    start = text.index("var PLANS = ") + len("var PLANS = ")
    end = text.index(";\n  var RETRIEVED")
    plans = json.loads(text[start:end])
    kept = [plan for plan in plans if not (plan["retailerId"] == "bluenrg" and plan["customer"] == "residential")]
    return kept


def slug(*parts):
    return re.sub(r"[^a-z0-9]+", "-", "-".join(parts).lower()).strip("-")


def tariffs_for(customer, rates, fuel):
    business = customer == "business"
    if fuel == "gas":
        return ["biz-gas" if business else "gas-single"]
    has_usage = "usage" in rates
    has_peak = "peak" in rates
    has_shoulder = "shoulder" in rates
    has_off = "offpeak" in rates
    has_soak = "soak" in rates
    has_demand = "demand" in rates
    has_fit = "fit" in rates
    has_cl = "cl1" in rates
    out = []
    if has_usage and not has_peak:
        if has_demand:
            out.append("biz-demand-single" if business else "demand-single")
        else:
            out.append("biz-single" if business else "single")
            if has_cl and not business:
                out.append("controlled")
            if has_fit and not business and not has_demand:
                out.append("solar")
                if has_cl:
                    out.append("controlled-solar")
    elif has_peak and has_off and has_shoulder and not has_soak:
        if has_demand and business:
            out.append("biz-demand")
        else:
            out.append("biz-tou" if business else "tou")
        if has_fit and not business and not has_demand:
            out.append("solar-tou")
    elif has_peak and has_off and has_soak and not has_shoulder and not business:
        out.append("tou-soak")
        if has_fit:
            out.append("solar-soak")
    elif has_peak and has_off and not has_shoulder:
        out.append("biz-two" if business else "tou-two")
        if has_fit and not business:
            out.append("solar-two")
    elif has_peak or has_off or has_shoulder or has_usage:
        out.append("biz-tou" if business else "tou")
    if has_cl and not business and "controlled" not in out and ("usage" in rates or "peak" in rates):
        if "single" in out or "tou" in out or "tou-two" in out:
            pass
        if "usage" in rates and "controlled" not in out and not business:
            out.append("controlled")
    return out


def load_drive():
    meta = {}
    with DRIVE_PLANS.open() as handle:
        for row in csv.DictReader(handle):
            if row["brand_slug"] not in BRANDS:
                continue
            if row["fuel"] not in ("ELECTRICITY", "GAS"):
                continue
            meta[row["plan_id"]] = row
    grouped = defaultdict(list)
    with DRIVE_RATES.open() as handle:
        for row in csv.DictReader(handle):
            if row["plan_id"] in meta:
                grouped[row["plan_id"]].append(row)
    return meta, grouped


def figures_for(row, rate_rows):
    customer = "business" if row["customer_type"] == "BUSINESS" else "residential" if row["customer_type"] == "RESIDENTIAL" else ""
    fuel = "gas" if row["fuel"] == "GAS" else "electricity"
    buckets = defaultdict(list)
    for rate in rate_rows:
        if rate.get("fuel") not in ("ELECTRICITY", "GAS", ""):
            continue
        key = bucket(rate)
        value = cents(rate)
        if not key or value is None:
            continue
        label = (rate.get("rate_name") or key).strip()
        block = rate.get("block_idx") or "0"
        buckets[key].append((value, label, block, (rate.get("rate_description") or "").strip()))
    rates = {}
    lines = []
    for key, items in buckets.items():
        if key == "free":
            lines.append("Free usage window at 0c. Other charges still apply.")
            continue
        unique = []
        seen = set()
        for value, label, block, desc in items:
            mark = (key, value, label, block)
            if mark in seen:
                continue
            seen.add(mark)
            unique.append((value, label, block, desc))
        values = {item[0] for item in unique if item[2] in ("", "0")}
        if key == "fitGov":
            for value, label, block, desc in unique:
                lines.append(label + " " + format(value, ".2f") + "c")
            continue
        if key == "usage" or key == "gas":
            first = [item for item in unique if item[2] in ("", "0")]
            later = [item for item in unique if item[2] not in ("", "0")]
            field = "gasUsage" if fuel == "gas" else "usage"
            later_differs = any(item[0] != first[0][0] for item in later) if first else bool(later)
            if len({item[0] for item in first}) == 1 and not later_differs:
                rates[field] = first[0][0]
            else:
                for value, label, block, desc in first + later:
                    lines.append(label + " " + format(value, ".2f") + "c" + (" block " + block if block not in ("", "0") else ""))
            continue
        later_differs = False
        if len(values) == 1:
            only = next(iter(values))
            later_differs = any(item[2] not in ("", "0") and item[0] != only for item in unique)
        if len(values) == 1 and not later_differs and key in ("supply", "usage", "peak", "shoulder", "offpeak", "soak", "cl1", "cl2", "clSupply", "cl2Supply", "demand", "fit"):
            rates[key] = next(iter(values))
        else:
            for value, label, block, desc in unique:
                bit = label + " " + format(value, ".2f") + "c"
                if desc and desc.lower() not in label.lower():
                    bit += " (" + desc[:80] + ")"
                lines.append(bit)
    if "cl1" in rates and "clSupply" not in rates:
        rates["clSupply"] = 0
    echo = []
    for key, label in (("cl1", "Controlled load 1"), ("cl2", "Controlled load 2"), ("clSupply", "Controlled load supply"), ("cl2Supply", "Controlled load 2 supply"), ("demand", "Demand"), ("fit", "Feed-in")):
        if key in rates:
            echo.append(label + " " + format(rates[key], ".2f") + "c")
    if row.get("plan_id") == "DOD221754SBE10@EME" and "supply" in rates:
        drive_supply = rates.pop("supply")
        lines.append("Daily supply " + format(drive_supply, ".2f") + "c on the Drive file and 244.14c on the Dodo price page. Neither is used for the year figure")
    if fuel == "gas" and "usage" in rates and "gasUsage" not in rates:
        rates["gasUsage"] = rates.pop("usage")
    if fuel == "gas":
        rates = {key: value for key, value in rates.items() if key in ("supply", "gasUsage")}
    lines = [line.replace("\u2013", "-").replace("\u2014", "-").replace("\ufffd", "-") for line in lines]
    return customer, fuel, rates, lines, echo


def fill_missing(existing, meta, grouped):
    """Add Drive figures an existing plan does not already store.

    A figure already on the plan is left as it is, including the two Dodo
    standing rows that do not match the public price page.
    """
    for plan in existing:
        row = meta.get(plan.get("planId"))
        if not row:
            continue
        _customer, _fuel, rates, lines, echo = figures_for(row, grouped.get(plan["planId"], []))
        added_keys = []
        for key, value in rates.items():
            if key not in plan["rates"]:
                plan["rates"][key] = value
                added_keys.append(key)
        current = plan.get("windows") or ""
        extra = [line for line in lines if line not in current]
        for line in echo:
            if line in current or line in extra:
                continue
            if any(label + " " + format(plan["rates"][key], ".2f") + "c" == line for key, label in (("cl1", "Controlled load 1"), ("cl2", "Controlled load 2"), ("clSupply", "Controlled load supply"), ("cl2Supply", "Controlled load 2 supply"), ("demand", "Demand")) if key in added_keys):
                extra.append(line)
        if extra:
            plan["windows"] = (current + ". " if current else "") + ". ".join(dict.fromkeys(extra))


def build_new(existing_ids, meta, grouped):
    added = []
    for plan_id, row in meta.items():
        retailer = BRANDS[row["brand_slug"]]
        customer = "business" if row["customer_type"] == "BUSINESS" else "residential" if row["customer_type"] == "RESIDENTIAL" else ""
        if not customer:
            continue
        if retailer == "bluenrg" and customer == "residential":
            continue
        customer, fuel, rates, lines, echo = figures_for(row, grouped.get(plan_id, []))
        if not customer:
            continue
        offer = "standing" if row["offer_type"] == "STANDING" else "market"
        name = row["plan_name"].strip()
        windows = ". ".join(dict.fromkeys(lines + echo))
        source = SITES[retailer]
        if retailer == "dodo" and offer == "standing":
            source = "https://www.dodo.com/price_var"
        effective = (row.get("effective_from") or "")[:10]
        if fuel == "electricity":
            networks = []
            for dist in row["distributors"].split(";"):
                mapped = NETWORKS.get(dist.strip().lower())
                if mapped and mapped not in networks:
                    networks.append(mapped)
            far_only = row["distributors"].strip().lower() == "essential energy far west"
            for network in networks:
                plan_name = name + " (Essential Energy Far West)" if far_only else name
                record = {
                    "id": slug(retailer, plan_id, network),
                    "retailerId": retailer,
                    "name": plan_name,
                    "offer": offer,
                    "customer": customer,
                    "fuel": "electricity",
                    "network": network,
                    "tariffs": tariffs_for(customer, rates, "electricity"),
                    "rates": rates,
                    "windows": windows,
                    "sourceUrl": source,
                    "planId": plan_id,
                    "effective": effective,
                }
                if not record["tariffs"]:
                    kind = row.get("tariff_type") or ""
                    if "TIME_OF_USE" in kind:
                        record["tariffs"] = ["biz-tou" if customer == "business" else "tou"]
                    else:
                        record["tariffs"] = ["biz-single" if customer == "business" else "single"]
                if (plan_id, network) in existing_ids:
                    continue
                added.append(record)
        else:
            regions = []
            for dist in row["distributors"].split(";"):
                region = GAS_REGION.get(dist.strip().lower())
                if region and region not in regions:
                    regions.append(region)
            for region in regions:
                record = {
                    "id": slug(retailer, plan_id, region, "gas"),
                    "retailerId": retailer,
                    "name": name,
                    "offer": offer,
                    "customer": customer,
                    "fuel": "gas",
                    "network": "",
                    "region": region,
                    "tariffs": tariffs_for(customer, rates, "gas"),
                    "rates": {key: value for key, value in rates.items() if key in ("supply", "gasUsage")},
                    "windows": windows,
                    "sourceUrl": source,
                    "planId": plan_id,
                    "effective": effective,
                }
                if (plan_id, "gas:" + region) in existing_ids:
                    continue
                added.append(record)
    # Same name and the same figures on the same network do not need two cards.
    seen = set()
    unique = []
    for plan in added:
        key = json.dumps([plan["retailerId"], plan.get("network"), plan.get("region"), plan["customer"], plan["fuel"], plan["name"], plan["tariffs"], plan["rates"], plan["windows"]], sort_keys=True)
        if key in seen:
            continue
        seen.add(key)
        unique.append(plan)
    return unique


def main():
    existing = load_existing()
    meta, grouped = load_drive()
    fill_missing(existing, meta, grouped)
    existing_ids = set()
    for plan in existing:
        if plan["fuel"] == "gas":
            existing_ids.add((plan["planId"], "gas:" + plan.get("region", "")))
        else:
            existing_ids.add((plan["planId"], plan["network"]))
    added = build_new(existing_ids, meta, grouped)
    plans = existing + added
    retrieved = "2026-11-14"
    body = """/* Generated from the Drive snapshot of 2026-11-14 and the plans already on file. Do not type rates in by hand. */
(function (root) {
  var PLANS = %s;
  var RETRIEVED = %s;

  function matching(retailerId, ctx) {
    if (!ctx) return [];
    return PLANS.filter(function (plan) {
      if (plan.retailerId !== retailerId || plan.customer !== ctx.customer || plan.fuel !== ctx.fuel) return false;
      if (plan.tariffs.indexOf(ctx.tariff) === -1) return false;
      if (plan.fuel === "gas") return plan.region === ctx.region;
      return plan.network === ctx.network;
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
""" % (json.dumps(plans, separators=(",", ":")), json.dumps(retrieved))
    PLANS_JS.write_text(body)
    print("existing", len(existing), "added", len(added), "total", len(plans))


if __name__ == "__main__":
    main()
