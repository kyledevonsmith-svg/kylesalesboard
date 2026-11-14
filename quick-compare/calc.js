"use strict";
/* Annual cost, comparison, bill reading, and state changes.
   Savings always include supply and the other components of the selected tariff. */
(function (root) {
  var D = root.QCData;

  function num(v) {
    if (v == null) return null;
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    var s = String(v).trim().replace(/,/g, "");
    if (!s) return null;
    var n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function r3(n) {
    return Math.round(n * 1000) / 1000;
  }

  function moneyRound(n) {
    return Math.round(n * 100) / 100;
  }

  function todayISO() {
    var d = new Date();
    var m = String(d.getMonth() + 1);
    var day = String(d.getDate());
    if (m.length < 2) m = "0" + m;
    if (day.length < 2) day = "0" + day;
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function formatDate(iso) {
    if (!iso) return D.VERIFIED_LABEL;
    var parts = String(iso).split("-");
    if (parts.length !== 3) return String(iso);
    var months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    var month = months[Number(parts[1]) - 1];
    var day = Number(parts[2]);
    if (!month || !day) return String(iso);
    return day + " " + month + " " + parts[0];
  }

  function formatMoney(n) {
    var value = moneyRound(n);
    var sign = value < 0 ? "−" : "";
    var body = Math.abs(value).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return sign + "$" + body;
  }

  function formatRate(n) {
    if (n == null || !Number.isFinite(n)) return "";
    return Number(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 3 });
  }

  function emptySide() {
    return {
      retailerId: "",
      name: "",
      custom: false,
      quoteUrl: "",
      planChoiceId: "",
      planLabel: "",
      variant: "",
      source: "",
      sourceDate: "",
      sourceNote: "",
      edited: false,
      rates: {},
      windows: {},
      contract: "",
      termMonths: "",
      exitNote: "",
      gstInclusive: true
    };
  }

  function createState() {
    return {
      a: emptySide(),
      b: emptySide(),
      c: null,
      ctx: {
        region: "",
        network: "",
        networkTouched: false,
        customer: "residential",
        fuel: "electricity",
        tariff: "single",
        postcode: "",
        hint: ""
      },
      usage: {},
      messages: { bill: "", context: "" }
    };
  }

  function sideFromBundle(bundle, source) {
    var side = emptySide();
    side.retailerId = bundle.retailerId;
    side.name = bundle.retailerName;
    side.quoteUrl = bundle.quoteUrl;
    side.planChoiceId = bundle.planChoiceId || "";
    side.planLabel = bundle.planName;
    side.variant = bundle.variant || "market";
    side.source = source;
    side.sourceDate = bundle.verified || D.VERIFIED_ISO;
    side.sourceNote = bundle.note || "";
    side.rates = {};
    Object.keys(bundle.rates || {}).forEach(function (key) {
      if (bundle.rates[key] != null && bundle.rates[key] !== "") side.rates[key] = bundle.rates[key];
    });
    side.windows = Object.assign({}, bundle.windows || {});
    side.contract = bundle.contract || "";
    side.termMonths = bundle.termMonths || "";
    side.exitNote = bundle.exitNote || "";
    side.gstInclusive = true;
    return side;
  }

  function resolveUsage(state) {
    var tariff = D.tariffById(state.ctx.tariff);
    var assumptions = [];
    var resolved = {};
    if (!tariff) return { resolved: resolved, assumptions: assumptions, incomplete: false };
    tariff.usage.forEach(function (field) {
      var entered = num(state.usage[field.key]);
      if (entered == null) {
        var fallback = D.defaultUsage(state.ctx, field.key);
        resolved[field.key] = fallback.value;
        assumptions.push(field.label + ": " + fallback.note);
      } else {
        resolved[field.key] = entered;
      }
    });
    return { resolved: resolved, assumptions: assumptions, incomplete: assumptions.length > 0 };
  }

  function annualCost(tariffId, side, usage) {
    var tariff = D.tariffById(tariffId);
    var lines = [];
    var missing = [];
    var rateAssumptions = [];
    var total = 0;
    var gstInclusive = !side || side.gstInclusive !== false;
    if (!tariff || !side) {
      return { complete: false, missing: ["Tariff"], lines: [], total: 0, normalised: 0, gstInclusive: true, rateAssumptions: [] };
    }
    var rates = side.rates || {};

    function add(label, dollars, detail) {
      var rounded = moneyRound(dollars);
      lines.push({ label: label, dollars: rounded, detail: detail || "" });
      total = moneyRound(total + rounded);
    }

    if (tariff.calc === "gas-block") {
      var supply = num(rates.supply);
      var b1 = num(rates.block1);
      var b2 = num(rates.block2);
      var limit = num(rates.block1Limit);
      var mj = usage ? usage.gasMj : null;
      if (supply == null) missing.push("Daily supply");
      if (b1 == null) missing.push("Block 1 usage");
      if (b2 == null) missing.push("Block 2 usage");
      if (limit == null) missing.push("Block 1 limit");
      if (mj == null) missing.push("Gas usage");
      if (!missing.length) {
        var daily = mj / 365;
        var first = Math.min(daily, limit);
        var second = Math.max(0, daily - limit);
        add("Daily supply", supply * 365 / 100, "365 days × " + formatRate(supply) + "c");
        add("Block 1", first * 365 * b1 / 100, formatRate(first) + " MJ/day × 365 × " + formatRate(b1) + "c");
        add("Block 2", second * 365 * b2 / 100, formatRate(second) + " MJ/day × 365 × " + formatRate(b2) + "c");
      }
      return finish(lines, total, missing, rateAssumptions, gstInclusive);
    }

    var extras = [];
    tariff.fields.forEach(function (field) {
      if (field.kind === "text" || field.kind === "gst" || field.kind === "limit") return;
      var value = num(rates[field.key]);
      if (field.per === "year") {
        if (value == null) {
          extras.push({ label: field.label, value: 0, assumed: true });
          rateAssumptions.push(field.label + " assumed at $0 because it was left blank. It is included as zero, not dropped.");
        } else {
          extras.push({ label: field.label, value: value, assumed: false });
        }
        return;
      }
      if (value == null) {
        if (field.optional) {
          var optionalQty = field.usageKey && usage ? usage[field.usageKey] : 0;
          if (optionalQty) missing.push(field.label);
          return;
        }
        missing.push(field.label);
        return;
      }
      if (field.per === "day") {
        add(field.label, value * 365 / 100, "365 days × " + formatRate(value) + "c");
      } else if (field.per === "kwh" || field.per === "mj") {
        var qty = usage ? usage[field.usageKey] : null;
        if (qty == null) {
          missing.push(field.label + " quantity");
          return;
        }
        var dollars = value * qty / 100;
        var unit = field.per === "mj" ? "MJ" : "kWh";
        if (field.kind === "higher") add("Solar export credit", -dollars, Number(qty).toLocaleString("en-AU") + " " + unit + " × " + formatRate(value) + "c");
        else add(field.label, dollars, Number(qty).toLocaleString("en-AU") + " " + unit + " × " + formatRate(value) + field.unit.replace("c", "c"));
      } else if (field.per === "kw-month") {
        var kw = usage ? usage.demandKw : null;
        if (kw == null) {
          missing.push("Demand kW");
          return;
        }
        add(field.label, value * kw * 12, Number(kw).toLocaleString("en-AU") + " kW × " + formatMoney(value) + "/kW/month × 12");
      }
    });

    if (extras.length) {
      var allZero = extras.every(function (item) { return item.value === 0; });
      if (allZero) add("Network, metering and other charges", 0, "None added on top of supply and usage");
      else extras.forEach(function (item) { add(item.label, item.value, item.assumed ? "Assumed $0" : "Entered amount"); });
    }

    return finish(lines, total, missing, rateAssumptions, gstInclusive);
  }

  function finish(lines, total, missing, rateAssumptions, gstInclusive) {
    var normalised = gstInclusive ? total : moneyRound(total * 1.1);
    return {
      complete: missing.length === 0,
      missing: missing,
      lines: lines,
      total: total,
      normalised: normalised,
      gstInclusive: gstInclusive,
      rateAssumptions: rateAssumptions
    };
  }

  function threshold(field) {
    if (field.unit === "c/day") return 0.5;
    if (field.unit === "$/year") return 5;
    if (field.unit === "$/kW/month") return 0.15;
    if (field.unit === "MJ/day") return 1;
    return 0.15;
  }

  function worseText(field, worse, better) {
    var diff = Math.abs(worse - better);
    var pct = Math.abs(better) < 0.0000001 ? null : (diff / Math.abs(better)) * 100;
    var pctText = pct == null ? "" : " (" + (worse > better ? "+" : "−") + pct.toFixed(1) + "%)";
    var direction = worse > better ? "Higher by " : "Lower by ";
    var amount;
    if (field.unit === "$/year") amount = formatMoney(diff) + "/year";
    else if (field.unit === "$/kW/month") amount = formatMoney(diff) + "/kW/month";
    else amount = formatRate(diff) + field.unit;
    return direction + amount + pctText;
  }

  function compareSides(state, usageResolved) {
    var tariff = D.tariffById(state.ctx.tariff);
    var aCost = annualCost(state.ctx.tariff, state.a, usageResolved);
    var bCost = annualCost(state.ctx.tariff, state.b, usageResolved);
    var rows = [];
    var windowsDiffer = false;
    if (!tariff) return { rows: rows, aCost: aCost, bCost: bCost, windowsDiffer: false, annualWinner: null };
    var gstMismatch = state.a.gstInclusive !== state.b.gstInclusive;
    var limitA = num(state.a.rates && state.a.rates.block1Limit);
    var limitB = num(state.b.rates && state.b.rates.block1Limit);
    var limitsDiffer = limitA != null && limitB != null && Math.abs(limitA - limitB) > 1;

    tariff.fields.forEach(function (field) {
      var row = {
        key: field.key,
        label: field.label,
        unit: field.unit || "",
        kind: field.kind,
        windowA: "",
        windowB: "",
        aText: "",
        bText: "",
        a: null,
        b: null,
        winner: null,
        worse: null,
        gap: "",
        neutral: false,
        missing: false
      };
      if (field.windowKey) {
        row.windowA = (state.a.windows && state.a.windows[field.windowKey]) || "";
        row.windowB = (state.b.windows && state.b.windows[field.windowKey]) || "";
        if (row.windowA && row.windowB && row.windowA.replace(/\s+/g, " ").trim() !== row.windowB.replace(/\s+/g, " ").trim()) windowsDiffer = true;
      }
      if (field.kind === "text") {
        row.aText = state.a[field.key] || "—";
        row.bText = state.b[field.key] || "—";
        rows.push(row);
        return;
      }
      if (field.kind === "gst") {
        row.aText = state.a.gstInclusive === false ? "GST exclusive" : "GST inclusive";
        row.bText = state.b.gstInclusive === false ? "GST exclusive" : "GST inclusive";
        if (gstMismatch) row.gap = "GST treatment differs. Cents below are not treated as the same basis.";
        rows.push(row);
        return;
      }
      var av = num(state.a.rates && state.a.rates[field.key]);
      var bv = num(state.b.rates && state.b.rates[field.key]);
      row.a = av;
      row.b = bv;
      if (av == null || bv == null) {
        row.missing = true;
        row.gap = "Missing — not treated as zero";
        rows.push(row);
        return;
      }
      if (field.kind === "limit") {
        row.neutral = true;
        if (Math.abs(av - bv) > 1) row.gap = "Block limits differ, so the block rates are not compared as the same rate. Annual cost uses each plan's own limit.";
        else row.gap = "Same block limit";
        rows.push(row);
        return;
      }
      var blocked = gstMismatch || (limitsDiffer && (field.key === "block1" || field.key === "block2"));
      if (blocked) {
        row.neutral = true;
        row.gap = gstMismatch
          ? "GST treatment differs, so these cents are not compared."
          : "Block limits differ, so this rate is not compared on its own. Use the annual cost.";
        rows.push(row);
        return;
      }
      if (!meaningful(field, av, bv)) {
        row.neutral = true;
        row.gap = "About the same";
        rows.push(row);
        return;
      }
      var lowerBetter = field.kind !== "higher";
      var bBetter = lowerBetter ? bv < av : bv > av;
      row.winner = bBetter ? "b" : "a";
      row.worse = bBetter ? "a" : "b";
      var worseValue = row.worse === "a" ? av : bv;
      var betterValue = row.worse === "a" ? bv : av;
      row.gap = worseText(field, worseValue, betterValue);
      rows.push(row);
    });

    var annualWinner = null;
    if (aCost.complete && bCost.complete && Math.abs(aCost.normalised - bCost.normalised) >= 5) {
      annualWinner = bCost.normalised < aCost.normalised ? "b" : "a";
    }
    return { rows: rows, aCost: aCost, bCost: bCost, windowsDiffer: windowsDiffer, annualWinner: annualWinner, gstMismatch: gstMismatch };
  }

  function meaningful(field, a, b) {
    return Math.abs(a - b) >= threshold(field);
  }

  function joinAnd(items) {
    if (!items.length) return "";
    if (items.length === 1) return items[0];
    if (items.length === 2) return items[0] + " and " + items[1];
    return items.slice(0, -1).join(", ") + " and " + items[items.length - 1];
  }

  function plainCompare(state, compared, usageInfo) {
    var tariff = D.tariffById(state.ctx.tariff);
    var aName = state.a.name || "the current retailer";
    var bName = state.b.name || "the alternative";
    if (!state.a.name || !state.b.name) {
      return "Choose the current retailer and an alternative. The annual figure is not a usage-rate comparison: supply and the other parts of this tariff have to be in it.";
    }
    if (!compared.aCost.complete || !compared.bCost.complete) {
      var bits = [];
      if (!compared.aCost.complete) bits.push(aName + " is missing " + compared.aCost.missing.join(", "));
      if (!compared.bCost.complete) bits.push(bName + " is missing " + compared.bCost.missing.join(", "));
      return "No annual saving is shown. " + bits.join(", and ") + ". A figure built from the usage rate alone would leave out supply and the other parts of this tariff.";
    }
    var saving = moneyRound(compared.aCost.normalised - compared.bCost.normalised);
    var betterB = [];
    var betterA = [];
    compared.rows.forEach(function (row) {
      if (row.winner === "b") betterB.push(row.label.toLowerCase());
      if (row.winner === "a") betterA.push(row.label.toLowerCase());
    });
    var text;
    var aud = formatMoney(Math.abs(saving));
    if (Math.abs(saving) < 5) {
      text = aName + " and " + bName + " come out within $5 a year on this " + (tariff ? tariff.label.toLowerCase() : "tariff") + ", once daily supply and the other components are included. Treat them as level until the live quote is checked.";
    } else if (saving > 0) {
      text = bName + " is estimated to cost " + aud + " less per year than the customer's current " + aName + " plan. That figure includes daily supply and the other components of this tariff, not the usage rate on its own.";
      if (betterB.length) text += " " + bName + " is cheaper on " + joinAnd(betterB) + ".";
      if (betterA.length) text += " " + aName + " is still better on " + joinAnd(betterA) + ".";
    } else {
      text = "The current " + aName + " plan is estimated to cost " + aud + " less per year than " + bName + ", including supply and the other components of this tariff. Moving the customer would not lower this bill on the usage used here.";
      if (betterA.length) text += " " + aName + " is cheaper on " + joinAnd(betterA) + ".";
      if (betterB.length) text += " " + bName + " is better on " + joinAnd(betterB) + ".";
    }
    if (compared.windowsDiffer) {
      text += " The time windows are not the same clock times, so a lower peak rate is not automatically the same hours. The annual figure prices the kWh entered in each band against that plan's own rate.";
    }
    if (usageInfo && usageInfo.incomplete) {
      text += " Usage is incomplete, so this is an estimate. The assumptions are listed with the saving.";
    }
    return text;
  }

  function refreshIfSample(side, ctx) {
    if (!side) return side;
    if (side.source !== "live" && side.source !== "abc") return side;
    if (!side.retailerId) return side;
    var bundle = D.buildReferencePlan(side.retailerId, ctx, side.variant || "market");
    if (!bundle) {
      var next = Object.assign({}, side, { rates: {}, windows: {} });
      next.sourceNote = D.whyNoPlan(side.retailerId, ctx);
      return next;
    }
    return sideFromBundle(bundle, side.source);
  }

  function setContext(state, patch) {
    var ctx = Object.assign({}, state.ctx);
    Object.keys(patch || {}).forEach(function (key) { ctx[key] = patch[key]; });
    if (Object.prototype.hasOwnProperty.call(patch, "network") && !Object.prototype.hasOwnProperty.call(patch, "postcode")) {
      ctx.networkTouched = true;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "postcode")) {
      var suggestion = D.suggestFromPostcode(patch.postcode);
      if (suggestion) {
        ctx.region = suggestion.region;
        ctx.hint = suggestion.hint;
        var currentNet = D.networkById(ctx.network);
        if (!ctx.networkTouched || !currentNet || currentNet.region !== suggestion.region) {
          ctx.network = suggestion.network;
          ctx.networkTouched = false;
        }
      }
    }
    if (Object.prototype.hasOwnProperty.call(patch, "region") && patch.region !== state.ctx.region && !Object.prototype.hasOwnProperty.call(patch, "postcode")) {
      var still = D.networkById(ctx.network);
      if (!still || still.region !== patch.region) {
        ctx.network = D.defaultNetwork(patch.region);
        ctx.networkTouched = false;
      }
      ctx.hint = "Reference network is a suggestion. Match it to the distributor on the bill.";
    }
    var allowed = D.tariffsFor(ctx.customer, ctx.fuel).map(function (tariff) { return tariff.id; });
    if (allowed.indexOf(ctx.tariff) === -1) ctx.tariff = allowed[0];
    var changed = ["region", "network", "tariff", "customer", "fuel"].some(function (key) {
      return state.ctx[key] !== ctx[key];
    });
    var b = state.b;
    var c = state.c;
    if (changed) {
      b = refreshIfSample(state.b, ctx);
      if (c) c = refreshIfSample(c, ctx);
    }
    var contextMessage = state.messages.context;
    if (changed && state.a && state.a.name) {
      contextMessage = "Retailer A is still " + state.a.name + ". Rates already entered for the current provider were kept.";
      if (state.b && (state.b.source === "live" || state.b.source === "abc")) {
        contextMessage += " Sample rates for the alternative were reloaded for this tariff.";
      }
    }
    return {
      a: state.a,
      b: b,
      c: c,
      ctx: ctx,
      usage: state.usage,
      messages: { bill: state.messages.bill, context: contextMessage }
    };
  }

  function selectCurrentRetailer(state, sel) {
    if (!sel) return state;
    if (!sel.custom && sel.id && sel.id === state.a.retailerId && state.a.name) return state;
    var side = emptySide();
    side.gstInclusive = true;
    var keepTyped = !state.a.name && !state.a.retailerId;
    if (keepTyped) {
      side.rates = Object.assign({}, state.a.rates);
      side.windows = Object.assign({}, state.a.windows);
      if (Object.keys(side.rates).length) {
        side.source = state.a.source || "manual";
        side.sourceDate = state.a.sourceDate || todayISO();
        side.sourceNote = state.a.sourceNote || "Typed on this page.";
      }
    }
    if (sel.custom) {
      side.name = String(sel.name || "").trim();
      side.custom = true;
      side.source = "manual";
      side.sourceDate = todayISO();
      side.sourceNote = "Retailer is not in the list. Enter the rates from the bill.";
    } else {
      var retailer = D.retailerById(sel.id);
      if (!retailer) return state;
      side.retailerId = retailer.id;
      side.name = retailer.name;
      side.quoteUrl = D.quoteUrlFor(retailer, state.ctx.customer);
      side.source = "";
      side.sourceNote = "Plan not identified. Enter the rates from the bill, or choose a plan name if you can see it. The advertised default is not loaded.";
    }
    return Object.assign({}, state, { a: side, b: state.b, c: state.c });
  }

  function selectPlan(state, choiceId) {
    var a = state.a;
    if (!a || !a.retailerId) return state;
    var retailer = D.retailerById(a.retailerId);
    if (!choiceId) {
      if (a.source === "bill" || a.source === "plan-doc" || a.source === "manual") {
        return Object.assign({}, state, { a: Object.assign({}, a, { planChoiceId: "" }) });
      }
      var cleared = Object.assign({}, a, {
        planChoiceId: "",
        planLabel: "",
        variant: "",
        source: "",
        sourceNote: "Plan not identified. Enter the rates from the bill. The advertised default is not loaded.",
        rates: {},
        windows: {},
        contract: "",
        termMonths: "",
        exitNote: ""
      });
      return Object.assign({}, state, { a: cleared, b: state.b });
    }
    var choice = null;
    D.planChoices(retailer, state.ctx.tariff).forEach(function (item) {
      if (item.id === choiceId) choice = item;
    });
    if (!choice) return state;
    var bundle = D.buildReferencePlan(retailer.id, state.ctx, choice.variant, choice);
    if (!bundle) {
      return Object.assign({}, state, {
        a: Object.assign({}, a, { planChoiceId: choice.id, planLabel: choice.label, sourceNote: D.whyNoPlan(retailer.id, state.ctx) }),
        b: state.b
      });
    }
    var next = sideFromBundle(bundle, "database");
    next.sourceNote = "Loaded because the plan name was identified. These are sample reference rates, not the cents on the customer's bill. " + bundle.note;
    return Object.assign({}, state, { a: next, b: state.b, c: state.c });
  }

  function selectAlternative(state, sel) {
    if (!sel) return state;
    if (sel.custom) {
      var custom = emptySide();
      custom.name = String(sel.name || "").trim();
      custom.custom = true;
      custom.source = "manual";
      custom.sourceDate = todayISO();
      custom.sourceNote = "Retailer is not in the reference list. Enter the rates.";
      return Object.assign({}, state, { a: state.a, b: custom, c: state.c });
    }
    var retailer = D.retailerById(sel.id);
    if (!retailer) return state;
    var bundle = D.buildReferencePlan(retailer.id, state.ctx, "market");
    if (!bundle) {
      var blank = emptySide();
      blank.retailerId = retailer.id;
      blank.name = retailer.name;
      blank.quoteUrl = D.quoteUrlFor(retailer, state.ctx.customer);
      blank.sourceNote = D.whyNoPlan(retailer.id, state.ctx);
      return Object.assign({}, state, { a: state.a, b: blank, c: state.c });
    }
    return Object.assign({}, state, { a: state.a, b: sideFromBundle(bundle, "live"), c: state.c });
  }

  function chooseRanked(state, retailerId, variant) {
    var bundle = D.buildReferencePlan(retailerId, state.ctx, variant || "market");
    if (!bundle) return state;
    var source = variant === "lowusage" ? "abc" : "live";
    return Object.assign({}, state, { a: state.a, b: sideFromBundle(bundle, source), c: state.c });
  }

  function patchSide(state, which, recipe) {
    if (!state[which]) return state;
    var copy = Object.assign({}, state);
    copy[which] = recipe(state[which]);
    return copy;
  }

  function enterRate(state, which, key, raw) {
    var side = state[which];
    if (!side) return state;
    var previous = side.rates && side.rates[key] != null ? String(side.rates[key]) : "";
    if (previous === String(raw)) return state;
    return patchSide(state, which, function (current) {
      var rates = Object.assign({}, current.rates);
      rates[key] = raw;
      var next = Object.assign({}, current, { rates: rates, edited: true });
      var prev = current.source;
      if (which === "a") {
        if (prev === "database" || !prev) {
          next.source = "manual";
          next.sourceDate = todayISO();
          next.sourceNote = prev === "database" ? "Edited after a sample plan was loaded. Treat as manual entry." : "Typed on this page.";
        } else if (prev === "bill" || prev === "plan-doc") {
          next.sourceNote = "Read from the document, then edited on this page.";
        }
      } else if (prev === "live" || prev === "abc" || !prev) {
        next.source = "manual";
        next.sourceDate = todayISO();
        next.sourceNote = prev ? "Typed over the sample reference." : "Typed on this page.";
      }
      return next;
    });
  }

  function setUsage(state, key, raw) {
    var usage = Object.assign({}, state.usage);
    usage[key] = raw;
    return Object.assign({}, state, { usage: usage, a: state.a, b: state.b, c: state.c });
  }

  function setWindow(state, which, key, raw) {
    return patchSide(state, which, function (current) {
      var windows = Object.assign({}, current.windows);
      windows[key] = raw;
      return Object.assign({}, current, { windows: windows });
    });
  }

  function setText(state, which, key, raw) {
    return patchSide(state, which, function (current) {
      var next = Object.assign({}, current);
      next[key] = raw;
      return next;
    });
  }

  function setGst(state, which, inclusive) {
    return patchSide(state, which, function (current) {
      return Object.assign({}, current, { gstInclusive: !!inclusive });
    });
  }

  function addExtra(state) {
    if (state.c) return state;
    return Object.assign({}, state, { a: state.a, b: state.b, c: emptySide() });
  }

  function removeExtra(state) {
    return Object.assign({}, state, { a: state.a, b: state.b, c: null });
  }

  function selectExtra(state, sel) {
    if (!state.c) state = addExtra(state);
    var drafted = selectAlternative(state, sel);
    return Object.assign({}, state, { a: state.a, b: state.b, c: drafted.b });
  }

  function promoteExtra(state) {
    if (!state.c || !state.c.name) return state;
    return Object.assign({}, state, { a: state.a, b: state.c, c: null });
  }

  function reloadSample(state, which) {
    var side = state[which];
    if (!side || !side.retailerId) return state;
    var retailer = D.retailerById(side.retailerId);
    var variant = side.variant || "market";
    var choice = null;
    if (retailer && side.planChoiceId) {
      D.planChoices(retailer, state.ctx.tariff).forEach(function (item) {
        if (item.id === side.planChoiceId) choice = item;
      });
      if (choice) variant = choice.variant;
    }
    var bundle = D.buildReferencePlan(side.retailerId, state.ctx, variant, choice);
    if (!bundle) return state;
    var source = which === "a" ? "database" : (variant === "lowusage" ? "abc" : "live");
    var nextSide = sideFromBundle(bundle, source);
    if (which === "a") nextSide.sourceNote = "Sample reference reloaded for the tariff and network now selected. Not the customer's bill. " + bundle.note;
    var copy = Object.assign({}, state);
    copy[which] = nextSide;
    return copy;
  }

  function rank(state, limit) {
    limit = limit || 5;
    var usage = resolveUsage(state);
    if (!state.ctx.region) return { rows: [], usage: usage, considered: 0, blocked: "Choose a state to rank alternatives." };
    if (state.ctx.fuel === "electricity" && !state.ctx.network) return { rows: [], usage: usage, considered: 0, blocked: "Choose a reference network to rank alternatives." };
    var rows = [];
    D.RETAILERS.forEach(function (retailer) {
      if (retailer.id === state.a.retailerId) return;
      if (!D.serves(retailer, state.ctx)) return;
      D.rankVariants(retailer, state.ctx).forEach(function (variant) {
        var bundle = D.buildReferencePlan(retailer.id, state.ctx, variant);
        if (!bundle) return;
        var side = sideFromBundle(bundle, variant === "market" ? "live" : "abc");
        var cost = annualCost(state.ctx.tariff, side, usage.resolved);
        if (!cost.complete) return;
        rows.push({
          retailerId: retailer.id,
          name: retailer.name,
          variant: variant,
          planName: bundle.planName,
          quoteUrl: bundle.quoteUrl,
          cost: cost,
          note: bundle.note
        });
      });
    });
    rows.sort(function (a, b) {
      if (a.cost.normalised !== b.cost.normalised) return a.cost.normalised - b.cost.normalised;
      return a.name.localeCompare(b.name);
    });
    return { rows: rows.slice(0, limit), usage: usage, considered: rows.length, blocked: rows.length ? "" : "No reference plan matches this state, fuel and tariff." };
  }

  function sourceLadder(side, which) {
    var active = side && side.source || "";
    var date = side && side.sourceDate ? formatDate(side.sourceDate) : "";
    function row(id, n, label, onFile) {
      var isActive = active === id;
      var status = isActive ? (date ? "Last verified " + date : "Active") : (onFile ? "On file " + D.VERIFIED_LABEL : "Not used");
      return { id: id, n: n, label: label, active: isActive, status: status };
    }
    if (which === "a") {
      return [
        row("bill", "1", "Actual bill", false),
        row("plan-doc", "2", "Current plan documentation", false),
        row("database", "3", "Authorised pricing database", true),
        row("manual", "4", "Manual entry", false)
      ];
    }
    return [
      row("live", "1", "Authorised live pricing (sample reference)", true),
      row("plan-doc", "2", "Plan documentation", false),
      row("abc", "3", "Verified internal ABC pricing database", true),
      row("manual", "4", "Manual entry", false)
    ];
  }

  function lastVerified(side) {
    if (!side || !side.source) return "Last verified: not set";
    return "Last verified: " + formatDate(side.sourceDate || D.VERIFIED_ISO);
  }

  function applyParsed(state, parsed, mode) {
    if (!parsed || !parsed.ok) {
      return {
        state: state,
        ok: false,
        message: (parsed && parsed.message) || "No rates could be read. The fields were left for manual entry."
      };
    }
    var a = Object.assign({}, state.a, {
      rates: Object.assign({}, state.a.rates),
      windows: Object.assign({}, state.a.windows)
    });
    if (parsed.retailerId) {
      var retailer = D.retailerById(parsed.retailerId);
      if (retailer) {
        a.retailerId = retailer.id;
        a.name = retailer.name;
        a.custom = false;
        a.quoteUrl = D.quoteUrlFor(retailer, state.ctx.customer);
      }
    }
    if (parsed.plan) {
      a.planChoiceId = parsed.plan.id || "";
      a.planLabel = parsed.plan.label;
      a.variant = parsed.plan.variant || "";
    }
    Object.keys(parsed.rates || {}).forEach(function (key) {
      if (parsed.rates[key] != null) a.rates[key] = parsed.rates[key];
    });
    a.source = mode === "plan-doc" ? "plan-doc" : "bill";
    a.sourceDate = parsed.billDateISO || todayISO();
    a.sourceNote = parsed.summary;
    a.edited = false;
    if (a.gstInclusive == null) a.gstInclusive = true;
    var usage = Object.assign({}, state.usage);
    Object.keys(parsed.usage || {}).forEach(function (key) {
      if (parsed.usage[key] != null) usage[key] = parsed.usage[key];
    });
    var next = {
      a: a,
      b: state.b,
      c: state.c,
      ctx: state.ctx,
      usage: usage,
      messages: { bill: parsed.summary, context: state.messages.context }
    };
    if (parsed.postcode) next = setContext(next, { postcode: parsed.postcode });
    next.messages = Object.assign({}, next.messages, { bill: parsed.summary });
    return { state: next, ok: true, message: parsed.summary };
  }

  function parseCents(chunk) {
    var line = String(chunk || "").split(/\n/)[0];
    var match = line.match(/(-?\d{1,4}(?:,\d{3})*(?:\.\d+)?)\s*(?:c|cents)\s*(?:\/|\s+per\s+)\s*(day|kwh|mj)\b/i);
    if (match) return { cents: r3(Math.abs(Number(match[1].replace(/,/g, "")))), per: match[2].toLowerCase() };
    match = line.match(/(-?\d{1,4}(?:\.\d+)?)\s*c\/(day|kwh|mj)\b/i);
    if (match) return { cents: r3(Math.abs(Number(match[1]))), per: match[2].toLowerCase() };
    match = line.match(/\$\s*(-?\d{1,3}(?:\.\d+)?)\s*(?:\/|\s+per\s+)\s*(day|kwh|mj)\b/i);
    if (match) return { cents: r3(Math.abs(Number(match[1])) * 100), per: match[2].toLowerCase() };
    return null;
  }

  function parseQty(chunk) {
    var match = String(chunk || "").split(/\n/)[0].match(/(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(kwh|mj|kw)\b/i);
    if (!match) return null;
    return { value: Number(match[1].replace(/,/g, "")), unit: match[2].toLowerCase() };
  }

  function parseDemand(chunk) {
    var match = String(chunk || "").split(/\n/)[0].match(/\$\s*(\d+(?:\.\d+)?)\s*(?:\/|\s*per\s*)\s*kw/i);
    if (!match) return null;
    return Number(match[1]);
  }

  function parseDate(token) {
    var months = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
    var match = String(token).trim().match(/(\d{1,2})[\/\s-]([A-Za-z]{3,}|\d{1,2})[\/\s-](\d{2,4})/);
    if (!match) return null;
    var month = /^\d+$/.test(match[2]) ? Number(match[2]) : months[match[2].slice(0, 3).toLowerCase()];
    var year = Number(match[3]);
    if (year < 100) year += 2000;
    if (!month || month > 12) return null;
    return { y: year, m: month, d: Number(match[1]) };
  }

  function isoFromParts(parts) {
    var m = String(parts.m);
    var d = String(parts.d);
    if (m.length < 2) m = "0" + m;
    if (d.length < 2) d = "0" + d;
    return parts.y + "-" + m + "-" + d;
  }

  function daysBetween(a, b) {
    var ms = Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d);
    return Math.round(ms / 86400000);
  }

  function findRetailer(text) {
    var best = null;
    var bestLen = 0;
    D.RETAILERS.forEach(function (retailer) {
      [retailer.name].concat(retailer.aliases).forEach(function (label) {
        if (!label || label.length < 2) return;
        var escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        var re = new RegExp("\\b" + escaped + "\\b", "i");
        if (re.test(text) && label.length > bestLen) {
          best = retailer;
          bestLen = label.length;
        }
      });
    });
    return best;
  }

  function hintTariff(rates) {
    var has = function (key) { return rates[key] != null; };
    if (has("peak") && has("shoulder") && has("offpeak") && has("fit")) return "solar-tou";
    if (has("peak") && has("soak") && has("offpeak") && has("fit")) return "solar-soak";
    if (has("peak") && has("offpeak") && has("fit")) return "solar-two";
    if (has("peak") && has("shoulder") && has("offpeak")) return "tou";
    if (has("peak") && has("soak") && has("offpeak")) return "tou-soak";
    if (has("peak") && has("offpeak")) return "tou-two";
    if ((has("cl1") || has("cl2")) && has("fit")) return "controlled-solar";
    if (has("cl1") || has("cl2")) return "controlled";
    if (has("fit")) return "solar";
    if (has("block1") && has("block2")) return "gas-block";
    if (has("gasUsage")) return "gas-single";
    if (has("demand")) return "biz-demand";
    return "";
  }

  function parseCsv(text) {
    var map = {
      supply: "supply", supply_c_per_day: "supply", daily_supply: "supply",
      usage: "usage", usage_c_per_kwh: "usage", peak: "peak", shoulder: "shoulder",
      offpeak: "offpeak", off_peak: "offpeak", cl1: "cl1", cl2: "cl2", fit: "fit",
      feed_in: "fit", gas: "gasUsage", gas_c_per_mj: "gasUsage", demand: "demand"
    };
    var rates = {};
    text.split(/\n/).forEach(function (line) {
      var bits = line.split(",");
      if (bits.length < 2) return;
      var key = map[bits[0].trim().toLowerCase().replace(/\s+/g, "_")];
      var value = num(bits[1]);
      if (key && value != null) rates[key] = value;
    });
    if (!Object.keys(rates).length) return null;
    return {
      ok: true,
      rates: rates,
      usage: {},
      retailerId: "",
      plan: null,
      postcode: "",
      billDateISO: "",
      hintTariff: hintTariff(rates),
      summary: "Read rates from the spreadsheet. Anything the file did not contain is left for manual entry."
    };
  }

  function parseBill(text) {
    var raw = String(text || "").replace(/\u00a0/g, " ").replace(/[¢]/g, "c");
    if (!raw.trim()) {
      return { ok: false, message: "Nothing was pasted. The fields were left for manual entry." };
    }
    if (/supply|usage|peak|daily_supply/i.test(raw.split(/\n/)[0] || "") && /,/.test(raw.split(/\n/)[0] || "")) {
      var csv = parseCsv(raw);
      if (csv) return csv;
    }
    var buckets = {};
    ["supply", "usage", "peak", "shoulder", "offpeak", "soak", "cl1", "cl2", "fit", "gas", "demand"].forEach(function (key) {
      buckets[key] = [];
    });
    var specs = [
      { re: /off[\s-]*peak/gi, kind: "offpeak" },
      { re: /shoulder/gi, kind: "shoulder" },
      { re: /solar\s*soak|solar\s*sponge|super\s*off[\s-]*peak/gi, kind: "soak" },
      { re: /controlled\s*load\s*2|\bcl\s*2\b/gi, kind: "cl2" },
      { re: /controlled\s*load(?!\s*2)/gi, kind: "cl1" },
      { re: /feed[\s-]*in|solar\s*export|export\s*rate|buy[\s-]*back/gi, kind: "fit" },
      { re: /\bpeak\b/gi, kind: "peak" },
      { re: /daily\s*supply|supply\s*charge|service\s*to\s*property/gi, kind: "supply" },
      { re: /general\s*usage|anytime\s*usage|usage\s*charge|all[\s-]*day/gi, kind: "usage" },
      { re: /gas\s*usage|usage\s*\(?\s*mj/gi, kind: "gas" },
      { re: /demand\s*charge|\bdemand\b/gi, kind: "demand" }
    ];
    specs.forEach(function (spec) {
      var match;
      var re = new RegExp(spec.re.source, spec.re.flags);
      while ((match = re.exec(raw))) {
        if (spec.kind === "peak") {
          var before = raw.slice(Math.max(0, match.index - 8), match.index).toLowerCase();
          if (/off[\s-]*$/.test(before)) continue;
        }
        var chunk = raw.slice(match.index, match.index + match[0].length + 90);
        buckets[spec.kind].push({
          rate: spec.kind === "demand" ? null : parseCents(chunk),
          qty: parseQty(chunk),
          demand: spec.kind === "demand" ? parseDemand(chunk) : null
        });
      }
    });

    function firstRate(kind, per) {
      var list = buckets[kind];
      for (var i = 0; i < list.length; i++) {
        if (list[i].rate && (!per || list[i].rate.per === per)) return list[i].rate.cents;
      }
      return null;
    }
    function firstQty(kind, unit) {
      var list = buckets[kind];
      for (var i = 0; i < list.length; i++) {
        if (list[i].qty && list[i].qty.unit === unit) return list[i].qty.value;
      }
      return null;
    }

    var rates = {};
    var supply = firstRate("supply", "day");
    var usage = firstRate("usage", "kwh");
    var peak = firstRate("peak", "kwh");
    var shoulder = firstRate("shoulder", "kwh");
    var offpeak = firstRate("offpeak", "kwh");
    var soak = firstRate("soak", "kwh");
    var cl1 = firstRate("cl1", "kwh");
    var cl2 = firstRate("cl2", "kwh");
    var fit = firstRate("fit", "kwh");
    var gas = firstRate("gas", "mj");
    var demand = null;
    buckets.demand.forEach(function (item) { if (item.demand != null && demand == null) demand = item.demand; });
    if (supply != null) rates.supply = supply;
    if (usage != null) rates.usage = usage;
    if (peak != null) rates.peak = peak;
    if (shoulder != null) rates.shoulder = shoulder;
    if (offpeak != null) rates.offpeak = offpeak;
    if (soak != null) rates.soak = soak;
    if (cl1 != null) rates.cl1 = cl1;
    if (cl2 != null) rates.cl2 = cl2;
    if (fit != null) rates.fit = fit;
    if (gas != null) rates.gasUsage = gas;
    if (demand != null) rates.demand = demand;

    var retailer = findRetailer(raw);
    var planLine = raw.match(/(?:plan\s*name|product(?:\s*name)?)\s*[:\-]\s*([^\n]{3,80})/i);
    var plan = D.matchPlan(planLine ? planLine[1] : raw, retailer && retailer.id);
    if (!plan && planLine) plan = D.matchPlan(raw, retailer && retailer.id);
    var postcodeMatch = raw.match(/\b(?:NSW|VIC|QLD|SA|WA|TAS|ACT|NT)\s*(\d{4})\b/i) || raw.match(/\bpost\s*code[:\s]*(\d{4})\b/i);
    var postcode = postcodeMatch ? postcodeMatch[1] : "";

    var days = null;
    var billDateISO = "";
    var period = raw.match(/(\d{1,2}[\/\s-][A-Za-z0-9]+[\/\s-]\d{2,4})\s*(?:to|–|-|through)\s*(\d{1,2}[\/\s-][A-Za-z0-9]+[\/\s-]\d{2,4})/i);
    if (period) {
      var start = parseDate(period[1]);
      var end = parseDate(period[2]);
      if (start && end) {
        var span = daysBetween(start, end);
        if (span >= 20 && span <= 400) days = span;
        billDateISO = isoFromParts(end);
      }
    }
    if (days == null) {
      var dayMatch = raw.match(/\b(\d{2,3})\s*days\b/i);
      if (dayMatch) {
        var counted = Number(dayMatch[1]);
        if (counted >= 20 && counted <= 400) days = counted;
      }
    }

    var usageOut = {};
    var notes = [];
    function takeQty(kind, unit, usageKey, label) {
      var qty = firstQty(kind, unit);
      if (qty == null) return;
      if (days) {
        usageOut[usageKey] = Math.round(qty / days * 365);
        notes.push(label + " annualised from " + qty + " " + unit + " over " + days + " days.");
      } else {
        notes.push("Saw " + qty + " " + unit + " of " + label.toLowerCase() + " but not the billing length, so annual usage was not filled in.");
      }
    }
    takeQty("usage", "kwh", "generalKwh", "General usage");
    takeQty("peak", "kwh", "peakKwh", "Peak");
    takeQty("shoulder", "kwh", "shoulderKwh", "Shoulder");
    takeQty("offpeak", "kwh", "offpeakKwh", "Off-peak");
    takeQty("soak", "kwh", "soakKwh", "Solar soak");
    takeQty("cl1", "kwh", "cl1Kwh", "Controlled load 1");
    takeQty("cl2", "kwh", "cl2Kwh", "Controlled load 2");
    takeQty("fit", "kwh", "exportKwh", "Solar export");
    takeQty("gas", "mj", "gasMj", "Gas");

    if (/\bNMI\b|national metering identifier/i.test(raw)) notes.push("A meter identifier was seen and was not kept.");

    var rateCount = Object.keys(rates).length;
    var signal = rateCount + (postcode ? 1 : 0) + (plan ? 1 : 0) + Object.keys(usageOut).length;
    if (!rateCount && !(retailer && signal)) {
      return { ok: false, message: "No supply or usage rates could be read from that text. The fields were left for manual entry." };
    }

    var read = Object.keys(rates).map(function (key) { return key; });
    var summary = "Read " + (read.length ? read.join(", ") : "the retailer") + ".";
    if (retailer) summary += " Retailer: " + retailer.name + ".";
    if (plan) summary += " Plan name matched: " + plan.label + ". Cents come from the document, not from the sample database.";
    if (notes.length) summary += " " + notes.join(" ");
    if (!rateCount) summary += " No cents were read, so the rate fields are left for manual entry.";
    var hint = hintTariff(rates);
    if (hint) summary += " The text looks like " + (D.tariffById(hint) ? D.tariffById(hint).label : hint) + ". Change the tariff if that is the meter. Rates already read are kept.";

    return {
      ok: true,
      rates: rates,
      usage: usageOut,
      retailerId: retailer ? retailer.id : "",
      plan: plan,
      postcode: postcode,
      billDateISO: billDateISO,
      hintTariff: hint,
      summary: summary.replace(/\s+/g, " ").trim()
    };
  }

  function unescapePdf(value) {
    return value.replace(/\\([nrtbf()\\])/g, function (_, ch) {
      return ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" })[ch] || ch;
    }).replace(/\\([0-7]{1,3})/g, function (_, oct) {
      return String.fromCharCode(parseInt(oct, 8));
    });
  }

  function stringsFromPdfContent(source) {
    var out = [];
    var tj = /\((?:\\.|[^\\)])*\)\s*Tj/g;
    var match;
    while ((match = tj.exec(source))) {
      var open = match[0].indexOf("(");
      var close = match[0].lastIndexOf(")");
      out.push(unescapePdf(match[0].slice(open + 1, close)));
    }
    var arrays = /\[([\s\S]*?)\]\s*TJ/g;
    while ((match = arrays.exec(source))) {
      var parts = match[1].match(/\((?:\\.|[^\\)])*\)/g) || [];
      out.push(parts.map(function (part) { return unescapePdf(part.slice(1, -1)); }).join(""));
    }
    return out.join("\n");
  }

  async function inflateOnce(bytes, format) {
    if (typeof DecompressionStream === "undefined" || typeof Blob === "undefined") return "";
    try {
      var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
      var buf = await new Response(stream).arrayBuffer();
      return new TextDecoder("latin1").decode(new Uint8Array(buf));
    } catch (err) {
      return "";
    }
  }

  async function extractPdfText(bytes) {
    var latin = new TextDecoder("latin1");
    var raw = latin.decode(bytes);
    var chunks = [stringsFromPdfContent(raw)];
    var re = /stream\r?\n/g;
    var match;
    while ((match = re.exec(raw))) {
      var start = match.index + match[0].length;
      var end = raw.indexOf("endstream", start);
      if (end < 0) break;
      var dictStart = raw.lastIndexOf("<<", match.index);
      var dict = dictStart >= 0 ? raw.slice(dictStart, match.index) : "";
      var slice = bytes.subarray(start, end);
      var cut = slice.length;
      while (cut > 0 && (slice[cut - 1] === 10 || slice[cut - 1] === 13 || slice[cut - 1] === 32)) cut -= 1;
      var body = slice.subarray(0, cut);
      var text = /FlateDecode/.test(dict) ? (await inflateOnce(body, "deflate") || await inflateOnce(body, "deflate-raw")) : latin.decode(body);
      if (text) chunks.push(stringsFromPdfContent(text));
    }
    return chunks.filter(Boolean).join("\n");
  }

  function latestJuly(today) {
    var year = today.getFullYear();
    var july = new Date(year, 6, 1);
    if (today < july) july = new Date(year - 1, 6, 1);
    return july;
  }

  function monthsBetween(start, today) {
    var months = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth());
    return months + (today.getDate() - start.getDate()) / 31;
  }

  function bandForTenure(months) {
    if (months <= 6) return "best";
    if (months >= 12) return "standing";
    return "market";
  }

  function tenureSummary(months, band, phrase, julyText, standingJuly) {
    var rounded = Math.round(months * 10) / 10;
    var how;
    if (rounded < 0.8) how = "less than a month";
    else if (rounded >= 18 && Math.abs(rounded / 12 - Math.round(rounded / 12)) < 0.15) how = "about " + Math.round(rounded / 12) + " years";
    else how = "about " + (Math.abs(rounded - Math.round(rounded)) < 0.05 ? String(Math.round(rounded)) : rounded.toFixed(1)) + " months";
    var line = "Matched \"" + phrase + "\" — " + how + ". ";
    if (band === "best") line += "Within 6 months of changing, so this is the retailer’s best plan.";
    else if (band === "standing") line += "A year or longer, so this is the standing offer, equal to the reference price.";
    else line += "Past 6 months and still inside the 12-month residential plan.";
    if (standingJuly) line += " Residential rates are reviewed each 1 July. This uses the current reference price.";
    else if (julyText) line += " Rates are reviewed on 1 July and may have changed on " + julyText + ".";
    return line;
  }

  function readTenure(text, today) {
    today = today ? new Date(today.getTime()) : new Date();
    today.setHours(12, 0, 0, 0);
    var raw = String(text || "");
    if (!raw.trim()) return null;
    var found = [];
    var used = [];

    function free(start, end) {
      return !used.some(function (span) { return start < span.end && end > span.start; });
    }
    function hold(start, end) {
      used.push({ start: start, end: end });
    }
    function add(months, phrase, kind, index) {
      if (months == null || !isFinite(months) || months < 0 || months > 240) return;
      found.push({ months: months, phrase: String(phrase).trim(), kind: kind, index: index });
    }
    function fromStart(start, phrase, kind, index) {
      if (!start || start > today) return;
      add(monthsBetween(start, today), phrase, kind, index);
    }

    var numWord = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, eighteen: 18 };
    function numberOf(token) {
      var key = String(token || "").toLowerCase();
      if (numWord[key] != null) return numWord[key];
      var n = Number(key);
      return isFinite(n) ? n : null;
    }
    var monthIndex = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
    function monthOf(name) {
      return monthIndex[String(name || "").slice(0, 3).toLowerCase()];
    }
    var NUM = "(?:\\d+(?:\\.\\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|eighteen)";
    var MON = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

    function mentionsReview(match) {
      var before = raw.slice(Math.max(0, match.index - 48), match.index).toLowerCase();
      if (/\b(since|joined|switched|moved|started|from|been|signed)\b/.test(before)) return false;
      return /\b(rates?|reviews?|reviewed|pricing|prices?)\b/.test(before);
    }

    function scan(re, kind, onMatch) {
      re.lastIndex = 0;
      var match;
      while ((match = re.exec(raw))) {
        if (!free(match.index, match.index + match[0].length)) continue;
        if (onMatch(match) !== false) hold(match.index, match.index + match[0].length);
      }
    }

    scan(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g, "date", function (match) {
      if (mentionsReview(match)) return false;
      fromStart(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])), match[0], "date", match.index);
    });
    scan(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](20\d{2})\b/g, "date", function (match) {
      if (mentionsReview(match)) return false;
      var day = Number(match[1]);
      var month = Number(match[2]);
      if (month < 1 || month > 12 || day < 1 || day > 31) return false;
      fromStart(new Date(Number(match[3]), month - 1, day), match[0], "date", match.index);
    });
    scan(new RegExp("\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(" + MON + ")(?:\\s+(20\\d{2}))?\\b", "gi"), "date", function (match) {
      if (mentionsReview(match)) return false;
      var month = monthOf(match[2]);
      var day = Number(match[1]);
      if (month == null || day < 1 || day > 31) return false;
      var start = match[3] ? new Date(Number(match[3]), month, day) : mostRecentDay(month, day, today);
      fromStart(start, match[0], match[3] ? "date" : "month", match.index);
    });
    scan(new RegExp("\\b(" + MON + ")\\s+(20\\d{2})\\b", "gi"), "date", function (match) {
      if (mentionsReview(match)) return false;
      var month = monthOf(match[1]);
      if (month == null) return false;
      fromStart(new Date(Number(match[2]), month, 1), match[0], "date", match.index);
    });
    scan(new RegExp("\\b(" + MON + ")\\s+last\\s+year\\b", "gi"), "month", function (match) {
      if (mentionsReview(match)) return false;
      var month = monthOf(match[1]);
      if (month == null) return false;
      fromStart(new Date(today.getFullYear() - 1, month, 1), match[0], "month", match.index);
    });
    scan(new RegExp("\\b(?:since|from|joined|switched|moved|changed|started|in)\\s+(" + MON + ")\\b", "gi"), "month", function (match) {
      if (mentionsReview(match)) return false;
      var month = monthOf(match[1]);
      if (month == null) return false;
      fromStart(mostRecentDay(month, 1, today), match[0], "month", match.index);
    });
    scan(new RegExp("\\b(?:over|more than|longer than|just over|after)\\s+(" + NUM + ")\\s+years?\\b", "gi"), "number", function (match) {
      var n = numberOf(match[1]);
      if (n == null) return false;
      add(n * 12 + 0.2, match[0], "number", match.index);
    });
    scan(new RegExp("\\b(?:over|more than|longer than|just over|after)\\s+(" + NUM + ")\\s+months?\\b", "gi"), "number", function (match) {
      var n = numberOf(match[1]);
      if (n == null) return false;
      add(n + 0.2, match[0], "number", match.index);
    });
    scan(new RegExp("\\b(?:under|within|less than|inside)\\s+(" + NUM + ")\\s+months?\\b", "gi"), "number", function (match) {
      var n = numberOf(match[1]);
      if (n == null) return false;
      add(n, match[0], "number", match.index);
    });
    scan(new RegExp("\\b(?:under|within|less than|inside)\\s+(?:a|one|1)\\s+years?\\b", "gi"), "number", function (match) {
      add(11, match[0], "number", match.index);
    });
    scan(/\b(?:a\s+)?year\s+and\s+a\s+half\b/gi, "number", function (match) {
      add(18, match[0], "number", match.index);
    });
    scan(/\bhalf\s+a\s+year\b/gi, "number", function (match) {
      add(6, match[0], "number", match.index);
    });
    scan(new RegExp("\\b(" + NUM + ")\\s*(?:years?|yrs?)\\b", "gi"), "number", function (match) {
      var n = numberOf(match[1]);
      if (n == null) return false;
      add(n * 12, match[0], "number", match.index);
    });
    scan(new RegExp("\\b(" + NUM + ")\\s*(?:months?|mths?|mnths?|mons?)\\b", "gi"), "number", function (match) {
      var n = numberOf(match[1]);
      if (n == null) return false;
      add(n, match[0], "number", match.index);
    });
    scan(/\b(\d+)\s+weeks?\b/gi, "number", function (match) {
      add(Number(match[1]) / 4.345, match[0], "number", match.index);
    });
    scan(/\b(?:a\s+)?couple\s+(?:of\s+)?months?\b/gi, "vague", function (match) {
      add(2, match[0], "vague", match.index);
    });
    scan(/\b(?:a\s+)?few\s+months?\b/gi, "vague", function (match) {
      add(3, match[0], "vague", match.index);
    });
    scan(/\bseveral\s+months?\b/gi, "vague", function (match) {
      add(8, match[0], "vague", match.index);
    });
    scan(/\b(?:for\s+years|years\s+ago|long[\s-]*term|a\s+long\s+time)\b/gi, "vague", function (match) {
      add(24, match[0], "vague", match.index);
    });
    scan(/\b(?:just\s+(?:switched|joined|moved|changed|signed)|new\s+customer|recently\s+(?:switched|joined|moved)|last\s+week|this\s+week|brand\s+new)\b/gi, "vague", function (match) {
      add(0.25, match[0], "vague", match.index);
    });

    if (!found.length) return null;
    var rank = { date: 5, month: 4, number: 3, vague: 1 };
    found.sort(function (a, b) {
      if (rank[a.kind] !== rank[b.kind]) return rank[b.kind] - rank[a.kind];
      return b.index - a.index;
    });
    var picked = found[0];
    var band = bandForTenure(picked.months);
    var start = new Date(today.getTime());
    start.setMonth(start.getMonth() - Math.floor(picked.months));
    var july = latestJuly(today);
    var julyText = "1 July " + july.getFullYear();
    var crossedJuly = start < july;
    return {
      months: Math.round(picked.months * 10) / 10,
      band: band,
      phrase: picked.phrase,
      julyReview: crossedJuly && band !== "standing",
      summary: tenureSummary(picked.months, band, picked.phrase, crossedJuly && band !== "standing" ? julyText : "", band === "standing")
    };
  }

  function mostRecentDay(month, day, today) {
    var date = new Date(today.getFullYear(), month, day);
    if (date > today) date = new Date(today.getFullYear() - 1, month, day);
    return date;
  }

  function readNoteFacts(text, today) {
    var raw = String(text || "");
    var lower = raw.toLowerCase();
    var uncertain = [];
    var postcode = null;
    var seen = {};
    var match;
    var postcodeRe = /\b(\d{4})\b/g;
    while ((match = postcodeRe.exec(raw))) {
      var digits = match[1];
      if (digits >= "2016" && digits <= "2035") {
        var around = lower.slice(Math.max(0, match.index - 12), match.index + 12);
        if (!/post\s?code|\bpc\b/.test(around)) continue;
      }
      if (!D.suggestFromPostcode(digits) || seen[digits]) continue;
      seen[digits] = true;
      var labelled = /post\s?code|\bpc\b/i.test(raw.slice(Math.max(0, match.index - 16), match.index + 4));
      if (!postcode) postcode = { value: digits, certain: labelled };
      else uncertain.push({ id: "postcode-many", question: "Notes mention more than one postcode. Use " + digits + " as well?" });
    }
    if (postcode && !postcode.certain) {
      uncertain.push({ id: "postcode-" + postcode.value, kind: "postcode", value: postcode.value, question: "Notes mention " + postcode.value + ". Use that postcode?" });
      postcode = null;
    }

    var bill = null;
    var moneyRe = /\$\s*(\d{1,5}(?:,\d{3})*(?:\.\d{2})?)/g;
    while ((match = moneyRe.exec(raw))) {
      var amount = Number(match[1].replace(/,/g, ""));
      if (!isFinite(amount) || amount <= 0) continue;
      var windowText = lower.slice(Math.max(0, match.index - 28), Math.min(lower.length, match.index + match[0].length + 28));
      var period = /quarter/.test(windowText) ? "quarter" : (/year|annual|p\.?a\b/.test(windowText) ? "year" : (/month|\/\s*mo|p\.?m\b/.test(windowText) ? "month" : ""));
      if (period) {
        if (!bill) bill = { amount: amount, period: period, certain: true };
      } else if (!bill) {
        uncertain.push({ id: "bill-" + amount, kind: "bill", amount: amount, question: "Notes mention a bill of $" + amount + ". Is that per month, per quarter, or per year?" });
      }
    }

    var customer = null;
    if (/\bbusiness\b|\bcommercial\b/.test(lower)) customer = "business";
    else if (/\bresidential\b|\bhousehold\b|\bhome\b/.test(lower)) customer = "residential";

    var usageLevel = null;
    if (/\b(low|small)\s+(user|usage|household)\b/.test(lower)) usageLevel = "low";
    else if (/\b(high|large|big)\s+(user|usage|household)\b/.test(lower)) usageLevel = "high";
    else if (/\bmedium\s+(user|usage|household)\b/.test(lower)) usageLevel = "medium";

    var tariffId = null;
    if (/\bdemand\b/.test(lower)) tariffId = "biz-demand";
    else if (/\btime of use\b|\btou\b/.test(lower)) tariffId = "tou";
    else if (/\bcontrolled load\b|\bhot water\b/.test(lower)) tariffId = "controlled";
    else if (/\bsingle rate\b|\bflat rate\b/.test(lower)) tariffId = "single";
    else if (/\bsolar\b/.test(lower)) tariffId = "solar";
    if (tariffId && !/\b(on|tariff|meter|plan|has|with)\b/.test(lower)) {
      var tariffNames = { "biz-demand": "demand", tou: "time of use", controlled: "controlled load", single: "single rate", solar: "solar" };
      uncertain.push({ id: "tariff-" + tariffId, kind: "tariff", value: tariffId, question: "Notes mention " + (tariffNames[tariffId] || tariffId) + ". Use that tariff?" });
      tariffId = null;
    }

    return {
      tenure: readTenure(raw, today),
      postcode: postcode,
      bill: bill,
      customer: customer,
      usageLevel: usageLevel,
      tariffId: tariffId,
      uncertain: uncertain
    };
  }

  root.QCCalc = {
    num: num,
    todayISO: todayISO,
    formatDate: formatDate,
    formatMoney: formatMoney,
    formatRate: formatRate,
    emptySide: emptySide,
    createState: createState,
    sideFromBundle: sideFromBundle,
    resolveUsage: resolveUsage,
    annualCost: annualCost,
    compareSides: compareSides,
    plainCompare: plainCompare,
    setContext: setContext,
    selectCurrentRetailer: selectCurrentRetailer,
    selectPlan: selectPlan,
    selectAlternative: selectAlternative,
    chooseRanked: chooseRanked,
    enterRate: enterRate,
    setUsage: setUsage,
    setWindow: setWindow,
    setText: setText,
    setGst: setGst,
    addExtra: addExtra,
    removeExtra: removeExtra,
    selectExtra: selectExtra,
    promoteExtra: promoteExtra,
    reloadSample: reloadSample,
    rank: rank,
    sourceLadder: sourceLadder,
    lastVerified: lastVerified,
    applyParsed: applyParsed,
    parseBill: parseBill,
    extractPdfText: extractPdfText,
    readTenure: readTenure,
    readNoteFacts: readNoteFacts
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
