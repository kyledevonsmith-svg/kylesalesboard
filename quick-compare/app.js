"use strict";
/* Home is a state rank, laid out like the Wattever cheapest-rate table.
   The left column is only the customer's retailer, plan and editable rates. */
(function () {
  var D = window.QCData;
  var C = window.QCCalc;
  var STATES = ["NSW", "QLD", "SA", "VIC", "ACT", "TAS", "NT", "WA"];
  var MONEY_KEYS = ["supply", "usage", "peak", "shoulder", "offpeak", "soak", "cl1", "cl2", "clSupply", "gasUsage", "block1", "block2", "fit", "demand"];
  var pack = loadPack();
  var state = pack.state;
  var usageTouched = pack.usageTouched;
  var openId = pack.openId;
  var sortAsc = pack.sortAsc !== false;
  var notes = pack.notes || "";
  var planPinned = !!pack.planPinned;
  var appliedBand = pack.appliedBand || "";
  var appliedRetailer = pack.appliedRetailer || "";
  var usageLevel = pack.usageLevel || "medium";
  var dismissed = pack.dismissed || {};
  var noteBill = pack.noteBill || null;
  var noteHint = "";
  var compareWith = pack.compareWith || "";
  var compareExtra = pack.compareExtra || "";
  var comparePlanId = pack.comparePlanId || "";
  var showDemand = !!pack.showDemand;
  var stateLocked = !!pack.stateLocked;
  var appearance = loadAppearance();

  function loadAppearance() {
    var fresh = { theme: "warm", layout: "cards" };
    try {
      var saved = JSON.parse(localStorage.getItem("qc-appearance-v1") || "null");
      if (!saved) return fresh;
      if (saved.theme === "daylight" || saved.theme === "night" || saved.theme === "warm") fresh.theme = saved.theme;
      if (saved.layout === "compact" || saved.layout === "focus" || saved.layout === "cards") fresh.layout = saved.layout;
    } catch (err) { /* private mode */ }
    return fresh;
  }

  function applyAppearance() {
    document.documentElement.setAttribute("data-theme", appearance.theme);
    document.documentElement.setAttribute("data-layout", appearance.layout);
  }

  function saveAppearance() {
    try { localStorage.setItem("qc-appearance-v1", JSON.stringify(appearance)); } catch (err) { /* private mode */ }
    applyAppearance();
  }

  applyAppearance();

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        if (key === "class") node.className = attrs[key];
        else node.setAttribute(key, attrs[key]);
      });
    }
    if (text != null && text !== "") node.textContent = text;
    return node;
  }

  function loadPack() {
    var fresh = {
      state: C.setContext(C.createState(), { region: "NSW", fuel: "electricity", customer: "residential", tariff: "single" }),
      usageTouched: false,
      openId: "",
      sortAsc: true,
      notes: "",
      planPinned: false,
      appliedBand: "",
      appliedRetailer: "",
      usageLevel: "medium",
      dismissed: {},
      noteBill: null,
      compareWith: "",
      compareExtra: "",
      comparePlanId: "",
      showDemand: false,
      stateLocked: false
    };
    try {
      var raw = sessionStorage.getItem("qc-home-v1");
      if (!raw) return fresh;
      var saved = JSON.parse(raw);
      if (!saved || !saved.state || !saved.state.a || !saved.state.ctx) return fresh;
      saved.state.usage = saved.state.usage || {};
      saved.state.messages = saved.state.messages || { bill: "", context: "" };
      saved.state.a.rates = saved.state.a.rates || {};
      if (saved.state.a.gstInclusive == null) saved.state.a.gstInclusive = true;
      return {
        state: saved.state,
        usageTouched: !!saved.usageTouched,
        openId: saved.openId || "",
        sortAsc: saved.sortAsc !== false,
        notes: saved.notes || "",
        planPinned: !!saved.planPinned,
        appliedBand: saved.appliedBand || "",
        appliedRetailer: saved.appliedRetailer || "",
        usageLevel: saved.usageLevel || "medium",
        dismissed: saved.dismissed || {},
        noteBill: saved.noteBill || null,
        compareWith: saved.compareWith || "",
        compareExtra: saved.compareExtra || "",
        comparePlanId: saved.comparePlanId || "",
        showDemand: !!saved.showDemand,
        stateLocked: !!saved.stateLocked
      };
    } catch (err) {
      return fresh;
    }
  }

  function save() {
    try {
      sessionStorage.setItem("qc-home-v1", JSON.stringify({
        state: state,
        usageTouched: usageTouched,
        openId: openId,
        sortAsc: sortAsc,
        notes: notes,
        planPinned: planPinned,
        appliedBand: appliedBand,
        appliedRetailer: appliedRetailer,
        usageLevel: usageLevel,
        dismissed: dismissed,
        noteBill: noteBill,
        compareWith: compareWith,
        compareExtra: compareExtra,
        comparePlanId: comparePlanId,
        showDemand: showDemand,
        stateLocked: stateLocked
      }));
    } catch (err) { /* private mode */ }
  }

  function keepDemand(current) {
    if (!showDemand || !current || current.ctx.fuel !== "electricity") return current;
    if (C.num(current.usage.demandKw) == null) current = C.setUsage(current, "demandKw", "15");
    return current;
  }

  function commit(next) {
    state = keepDemand(next);
    save();
    paint();
  }

  function rateKey() {
    return state.ctx.fuel === "gas" ? "gasUsage" : "usage";
  }

  function primaryRateKey() {
    if (state.ctx.fuel === "gas") return "gasUsage";
    var tariff = D.tariffById(state.ctx.tariff);
    if (!tariff) return "usage";
    var field = tariff.fields.filter(function (item) { return item.per === "kwh" || item.per === "mj"; })[0];
    return field ? field.key : "usage";
  }

  function usageKey() {
    var tariff = D.tariffById(state.ctx.tariff);
    if (tariff && tariff.usage && tariff.usage[0]) return tariff.usage[0].key;
    return state.ctx.fuel === "gas" ? "gasMj" : "generalKwh";
  }

  function usageUnit() {
    return state.ctx.fuel === "gas" ? "MJ/year" : "kWh/year";
  }

  function refWord() {
    if (state.ctx.region === "VIC") return "VDO";
    if (state.ctx.fuel === "electricity") {
      var network = D.networkById(state.ctx.network);
      if (network && network.quality === "regulator-cap") return "DMO";
    }
    return "reference";
  }

  function inclusiveCents(side, key) {
    var n = C.num(side && side.rates ? side.rates[key] : null);
    if (n == null) return null;
    if (side.gstInclusive === false) return Math.round(n * 1.1 * 1000) / 1000;
    return n;
  }

  function displayCents(inclusiveValue) {
    if (inclusiveValue == null || !Number.isFinite(inclusiveValue)) return "—";
    var show = state.a && state.a.gstInclusive === false ? inclusiveValue / 1.1 : inclusiveValue;
    return show.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "c";
  }

  function displayMoney(inclusiveDollars) {
    var show = state.a && state.a.gstInclusive === false ? inclusiveDollars / 1.1 : inclusiveDollars;
    var rounded = Math.round(show);
    return "$" + Math.abs(rounded).toLocaleString("en-AU");
  }

  function withGst(current, inclusive) {
    var side = current.a;
    if (!side) return current;
    var fromInc = side.gstInclusive !== false;
    if (fromInc === !!inclusive) return C.setGst(current, "a", !!inclusive);
    var factor = inclusive ? 1.1 : 1 / 1.1;
    var rates = Object.assign({}, side.rates);
    MONEY_KEYS.forEach(function (key) {
      var n = C.num(rates[key]);
      if (n == null) return;
      rates[key] = Math.round(n * factor * 1000) / 1000;
    });
    var nextSide = Object.assign({}, side, { rates: rates, gstInclusive: !!inclusive });
    return Object.assign({}, current, { a: nextSide });
  }

  function rateFields() {
    var tariff = D.tariffById(state.ctx.tariff);
    if (!tariff) return [];
    var fields = tariff.fields.filter(function (field) {
      return field.kind !== "text" && field.kind !== "gst" && field.kind !== "limit" && field.per !== "year";
    });
    if (showDemand && state.ctx.fuel === "electricity" && !fields.some(function (field) { return field.key === "demand"; })) {
      fields.push({ key: "demand", label: "Demand", unit: "$/kW/month", per: "kw-month", kind: "lower" });
    }
    return fields;
  }

  function addDemandCost(side, cost) {
    if (!showDemand || state.ctx.fuel !== "electricity" || !cost || !cost.complete) return cost;
    var tariff = D.tariffById(state.ctx.tariff);
    if (tariff && tariff.fields.some(function (field) { return field.key === "demand"; })) return cost;
    var rate = inclusiveCents(side, "demand");
    if (rate == null) return cost;
    var kw = C.num(state.usage.demandKw);
    if (kw == null) kw = 15;
    var extra = rate * kw * 12;
    return Object.assign({}, cost, { total: cost.total + extra, normalised: cost.normalised + extra });
  }

  function withDemand(side) {
    return side;
  }

  function displayField(field, inclusiveValue) {
    if (inclusiveValue == null || !Number.isFinite(inclusiveValue)) return "—";
    if (field.per === "kw-month" || field.per === "year") {
      var show = state.a && state.a.gstInclusive === false ? inclusiveValue / 1.1 : inclusiveValue;
      return "$" + show.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return displayCents(inclusiveValue);
  }

  function referenceSide(ctx) {
    var side = C.emptySide();
    side.gstInclusive = true;
    if (ctx.fuel === "gas") {
      var region = D.REGIONS[ctx.region];
      if (!region || !region.gas) return null;
      side.rates = { supply: region.gas.supply, gasUsage: region.gas.usage };
      return side;
    }
    var retailer = D.RETAILERS.filter(function (item) { return D.serves(item, ctx) && !item.publishedDirect; })[0];
    if (!retailer) return null;
    var bundle = D.buildReferencePlan(retailer.id, ctx, "standing");
    if (!bundle) return null;
    side.rates = bundle.rates;
    return side;
  }

  function homeRows() {
    var usage = C.resolveUsage(state);
    var ref = referenceSide(state.ctx);
    var refCost = ref ? C.annualCost(state.ctx.tariff, ref, usage.resolved) : null;
    if (refCost && refCost.complete && showDemand && state.ctx.fuel === "electricity") {
      var network = D.networkById(state.ctx.network);
      var kw = C.num(state.usage.demandKw);
      if (kw == null) kw = 15;
      if (network && network.demand != null && !(D.tariffById(state.ctx.tariff) && D.tariffById(state.ctx.tariff).fields.some(function (field) { return field.key === "demand"; }))) {
        var extra = network.demand * kw * 12;
        refCost = Object.assign({}, refCost, { total: refCost.total + extra, normalised: refCost.normalised + extra });
      }
    }
    var rows = [];
    var hiddenWorse = 0;
    var offerMissing = !D.tariffsAvailable(state.ctx).some(function (tariff) { return tariff.id === state.ctx.tariff; });
    var custUsage = inclusiveCents(state.a, primaryRateKey());
    var custSupply = inclusiveCents(state.a, "supply");
    D.RETAILERS.forEach(function (retailer) {
      if (!D.serves(retailer, state.ctx)) return;
      var isCustomer = retailer.id === state.a.retailerId;
      var mark = D.tableMark(retailer.id);
      var isOurs = mark === "ours" || mark === "both";
      if (state.a.retailerId && !isCustomer && !isOurs) return;
      var plans = window.QCPublic ? QCPublic.matching(retailer.id, state.ctx) : [];
      if (!plans.length) {
        if (!isOurs && !isCustomer) return;
        rows.push({ retailer: retailer, bundle: null, side: C.emptySide(), cost: { normalised: Infinity, complete: false }, publicMissing: true });
        return;
      }
      plans.forEach(function (plan) {
        var bundle = QCPublic.toBundle(plan, retailer);
        var side = C.sideFromBundle(bundle, "plan-doc");
        var cost = C.annualCost(state.ctx.tariff, side, usage.resolved);
        if (!cost.complete) return;
        var rowUsage = inclusiveCents(side, primaryRateKey());
        var rowSupply = inclusiveCents(side, "supply");
        if (!isCustomer && custUsage != null && custSupply != null && rowUsage != null && rowSupply != null && rowUsage > custUsage && rowSupply > custSupply) {
          hiddenWorse += 1;
          return;
        }
        rows.push({ retailer: retailer, bundle: bundle, side: side, cost: cost, plan: plan });
      });
    });
    rows.sort(function (a, b) {
      var aCost = a.cost && a.cost.complete ? a.cost.normalised : Infinity;
      var bCost = b.cost && b.cost.complete ? b.cost.normalised : Infinity;
      var diff = aCost - bCost;
      if (!sortAsc && a.cost && a.cost.complete && b.cost && b.cost.complete) diff = -diff;
      if (diff) return diff;
      return a.retailer.name.localeCompare(b.retailer.name);
    });
    return { rows: rows, usage: usage, refCost: refCost && refCost.complete ? refCost : null, hiddenWorse: hiddenWorse, offerMissing: offerMissing, narrowed: !!state.a.retailerId };
  }

  function comparisonText(cost, refCost) {
    if (!refCost || !refCost.normalised) return "—";
    var pct = Math.round((refCost.normalised - cost.normalised) / refCost.normalised * 100);
    var word = refWord();
    if (pct > 0) return pct + "% less than " + word;
    if (pct < 0) return Math.abs(pct) + "% more than " + word;
    return "same as " + word;
  }

  function customerCost(usage) {
    var side = state.a;
    if (!side || !side.name || C.num(side.rates[primaryRateKey()]) == null || C.num(side.rates.supply) == null) return null;
    var cost = C.annualCost(state.ctx.tariff, side, usage.resolved);
    if (!cost.complete) return null;
    return addDemandCost(withDemand(side, D.retailerById(side.retailerId)), cost);
  }

  function retailersNow() {
    return D.RETAILERS.filter(function (retailer) {
      return D.serves(retailer, state.ctx);
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });
  }

  function fillUsage(current) {
    var tariff = D.tariffById(current.ctx.tariff);
    if (!tariff) return current;
    var usage = {};
    tariff.usage.forEach(function (field) {
      usage[field.key] = String(D.defaultUsage(current.ctx, field.key).value);
    });
    return Object.assign({}, current, { usage: usage });
  }

  function choiceForBand(current, band) {
    if (!window.QCPublic || !current.a || !current.a.retailerId) return null;
    var plans = QCPublic.matching(current.a.retailerId, current.ctx);
    if (!plans.length) return null;
    if (band === "standing") {
      var basic = null;
      plans.forEach(function (plan) {
        if (plan.offer === "standing" && plan.name.indexOf("Solar Sharer") === -1 && !basic) basic = plan;
      });
      return basic || plans[0];
    }
    var retailer = D.retailerById(current.a.retailerId);
    var usage = C.resolveUsage(current);
    var best = null;
    var bestCost = Infinity;
    plans.forEach(function (plan) {
      var side = C.sideFromBundle(QCPublic.toBundle(plan, retailer), "plan-doc");
      var cost = C.annualCost(current.ctx.tariff, side, usage.resolved);
      if (!cost.complete || cost.normalised >= bestCost) return;
      bestCost = cost.normalised;
      best = plan;
    });
    return best || plans[0];
  }

  function applyPublic(current, plan) {
    var retailer = D.retailerById(current.a.retailerId);
    var side = C.sideFromBundle(QCPublic.toBundle(plan, retailer), "plan-doc");
    var next = Object.assign({}, current, { a: side });
    if (current.a && current.a.gstInclusive === false) return withGst(next, false);
    return next;
  }

  function clearPlan(current) {
    if (!current.a) return current;
    return Object.assign({}, current, {
      a: Object.assign({}, current.a, {
        planChoiceId: "",
        planLabel: "",
        variant: "",
        source: "",
        sourceNote: "",
        rates: {},
        windows: {},
        contract: "",
        termMonths: "",
        exitNote: ""
      })
    });
  }

  function reapplyPublic(current) {
    if (!current.a || !current.a.retailerId || !window.QCPublic) return clearPlan(current);
    var plans = QCPublic.matching(current.a.retailerId, current.ctx);
    var still = QCPublic.byId(current.a.planChoiceId);
    if (still && plans.some(function (plan) { return plan.id === still.id; })) return applyPublic(current, still);
    if (!plans.length) return clearPlan(current);
    var best = choiceForBand(current, "best");
    return applyPublic(current, best || plans[0]);
  }

  function scaleUsage(current, level) {
    var tariff = D.tariffById(current.ctx.tariff);
    if (!tariff) return current;
    var factor = level === "low" ? 0.55 : level === "high" ? 1.8 : 1;
    var usage = Object.assign({}, current.usage);
    tariff.usage.forEach(function (field) {
      usage[field.key] = String(Math.round(D.defaultUsage(current.ctx, field.key).value * factor));
    });
    return Object.assign({}, current, { usage: usage });
  }

  function finishUsage(current) {
    if (usageLevel !== "manual") return scaleUsage(current, usageLevel);
    return current;
  }

  function ensureOffer(current) {
    var list = D.tariffsAvailable(current.ctx);
    if (!list.length) return current;
    if (list.some(function (item) { return item.id === current.ctx.tariff; })) return current;
    return C.setContext(current, { tariff: list[0].id });
  }

  function tariffForFamily(ctx, family) {
    var available = D.tariffsAvailable(ctx).map(function (tariff) { return tariff.id; });
    var order = {
      tou: ["tou", "tou-two", "tou-soak", "biz-tou", "biz-two"],
      "solar-tou": ["solar-tou", "solar-two", "solar-soak", "tou", "tou-two", "tou-soak"],
      single: ["single", "biz-single", "gas-single", "biz-gas"],
      controlled: ["controlled", "controlled-solar"],
      demand: ["biz-demand"],
      solar: ["solar", "solar-tou", "solar-two", "solar-soak", "controlled-solar"]
    };
    var list = (order[family] || []).slice();
    if (ctx.customer === "business") {
      list = list.filter(function (id) { return id.indexOf("biz-") === 0; }).concat(list);
    }
    for (var i = 0; i < list.length; i++) {
      if (available.indexOf(list[i]) !== -1) return list[i];
    }
    return "";
  }

  function applyFacts(current) {
    var facts = C.readNoteFacts(notes, new Date());
    if (facts.customer && facts.customer !== current.ctx.customer && !dismissed.customer) {
      current = ensureOffer(C.setContext(current, { customer: facts.customer }));
    }
    if (facts.postcode && facts.postcode.certain && facts.postcode.value !== current.ctx.postcode && !dismissed["postcode-" + facts.postcode.value]) {
      stateLocked = true;
      current = ensureOffer(C.setContext(current, { postcode: facts.postcode.value }));
    }
    if (facts.tariffFamily && !dismissed["tariff-" + facts.tariffFamily]) {
      var picked = tariffForFamily(current.ctx, facts.tariffFamily);
      if (picked && picked !== current.ctx.tariff) current = C.setContext(current, { tariff: picked });
      else if (!picked) noteHint = "That tariff is not on file for this distribution zone, so it was left off the list.";
    }
    if (facts.retailerId && !planPinned && !dismissed["retailer-" + facts.retailerId]) {
      var named = D.retailerById(facts.retailerId);
      var replace = !current.a.retailerId || facts.retailerExplicit;
      if (named && replace && D.offerExists(named, current.ctx) && facts.retailerId !== current.a.retailerId) {
        current = C.selectCurrentRetailer(current, { id: named.id, name: named.name, custom: false });
        appliedBand = "";
      }
    }
    if (facts.usageLevel && facts.usageLevel !== usageLevel && !dismissed["level-" + facts.usageLevel]) {
      usageLevel = facts.usageLevel;
      usageTouched = false;
    }
    noteBill = facts.bill && facts.bill.certain ? facts.bill : noteBill;
    return current;
  }

  function applyTenure(current) {
    var read = C.readTenure(notes, new Date());
    if (!read || planPinned || !current.a || !current.a.retailerId) {
      if (!read) {
        appliedBand = "";
        appliedRetailer = "";
      }
      return finishUsage(current);
    }
    var choice = choiceForBand(current, read.band);
    if (!choice) return finishUsage(clearPlan(current));
    if (current.a.planChoiceId === choice.id && appliedBand === read.band && appliedRetailer === current.a.retailerId) return finishUsage(current);
    var next = applyPublic(current, choice);
    if (usageLevel === "manual" && !usageTouched) next = fillUsage(next);
    appliedBand = read.band;
    appliedRetailer = current.a.retailerId;
    return finishUsage(next);
  }

  function setFuel(fuel) {
    var next = ensureOffer(C.setContext(state, { fuel: fuel }));
    if (next.a && next.a.retailerId && !D.offerExists(D.retailerById(next.a.retailerId), next.ctx)) {
      next = Object.assign({}, next, { a: C.emptySide() });
    }
    openId = "";
    appliedBand = "";
    if (usageLevel === "manual" && !usageTouched) next = fillUsage(next);
    next = applyTenure(next);
    commit(next);
  }

  function setCustomer(kind) {
    var next = ensureOffer(C.setContext(state, { customer: kind }));
    if (next.a && next.a.retailerId && !D.offerExists(D.retailerById(next.a.retailerId), next.ctx)) {
      next = Object.assign({}, next, { a: C.emptySide() });
    }
    openId = "";
    appliedBand = "";
    next = applyTenure(next);
    commit(next);
  }

  function setLevel(level) {
    if (window.QCCompare) window.QCCompare.reset();
    usageLevel = level;
    usageTouched = level === "manual";
    if (level === "manual") {
      save();
      paint();
      return;
    }
    appliedBand = "";
    commit(applyTenure(state));
  }

  function setRegion(region) {
    stateLocked = true;
    var next = ensureOffer(C.setContext(state, { region: region }));
    if (next.a && next.a.retailerId) {
      var retailer = D.retailerById(next.a.retailerId);
      if (!retailer || !D.serves(retailer, next.ctx)) {
        next = Object.assign({}, next, { a: C.emptySide() });
      } else if (next.a.planChoiceId || next.a.source === "plan-doc") {
        next = reapplyPublic(next);
        if (!usageTouched) next = fillUsage(next);
      }
    }
    openId = "";
    appliedBand = "";
    next = applyTenure(next);
    commit(next);
  }

  function setRetailer(id) {
    planPinned = false;
    appliedBand = "";
    appliedRetailer = "";
    var next = C.selectCurrentRetailer(state, { id: id, name: "", custom: false });
    if (!usageTouched) next = fillUsage(next);
    next = applyTenure(next);
    commit(next);
  }

  function setPlan(choiceId) {
    planPinned = true;
    var plan = window.QCPublic && QCPublic.byId(choiceId);
    if (!plan) {
      commit(clearPlan(state));
      return;
    }
    var next = applyPublic(state, plan);
    if (!usageTouched) next = fillUsage(next);
    commit(next);
  }

  function inkForRate(mark, retailerInc, customerInc, lowerIsBetter) {
    if (customerInc != null && retailerInc != null && customerInc !== 0) {
      var gap = (customerInc - retailerInc) / Math.abs(customerInc);
      if (Math.abs(gap) >= 0.0008) {
        var better = lowerIsBetter ? retailerInc < customerInc : retailerInc > customerInc;
        return better ? "ink-better" : "ink-worse";
      }
    }
    if (mark === "sell" || mark === "both") return "ink-sell";
    return "";
  }

  function paintFuels() {
    var host = document.getElementById("fuels");
    host.replaceChildren();
    var who = el("div", { class: "fuel-row" });
    [["residential", "Residential"], ["business", "Business"]].forEach(function (pair) {
      var button = el("button", { type: "button", class: state.ctx.customer === pair[0] ? "is-on" : "" }, pair[1]);
      button.addEventListener("click", function () { setCustomer(pair[0]); });
      who.append(button);
    });
    var fuel = el("div", { class: "fuel-row" });
    [["electricity", "Electricity"], ["gas", "Gas"]].forEach(function (pair) {
      var button = el("button", { type: "button", class: state.ctx.fuel === pair[0] ? "is-on" : "" }, pair[1]);
      button.addEventListener("click", function () { setFuel(pair[0]); });
      fuel.append(button);
    });
    host.append(who, fuel);
  }

  function paintStates() {
    var host = document.getElementById("states");
    var title = document.querySelector("h1");
    var region = D.REGIONS[state.ctx.region];
    host.replaceChildren();
    if (stateLocked) {
      if (title) title.textContent = region ? region.name : state.ctx.region;
      host.className = "states is-locked";
      host.append(el("span", { class: "state-lock" }, state.ctx.region));
      var change = el("button", { type: "button", class: "change-state" }, "Change state");
      change.addEventListener("click", function () {
        stateLocked = false;
        save();
        paint();
      });
      host.append(change);
      return;
    }
    if (title) title.textContent = "Where is the customer?";
    host.className = "states";
    STATES.forEach(function (id) {
      var button = el("button", {
        type: "button",
        class: state.ctx.region === id ? "is-on" : "",
        "aria-pressed": state.ctx.region === id ? "true" : "false"
      }, id);
      button.addEventListener("click", function () { setRegion(id); });
      host.append(button);
    });
  }

  function paintSubtitle() {
    var host = document.getElementById("subtitle");
    if (!stateLocked) {
      host.replaceChildren();
      return;
    }
    var region = D.REGIONS[state.ctx.region];
    var place = region ? region.name : state.ctx.region;
    host.replaceChildren();
    if (state.ctx.fuel === "gas") {
      host.textContent = "Gas";
      return;
    }
    var nets = D.networksFor(state.ctx.region);
    var network = D.networkById(state.ctx.network);
    if (nets.length < 2) {
      host.textContent = network ? network.name : place;
      return;
    }
    host.append(document.createTextNode("Distributor "));
    var label = el("label", { class: "network" });
    var select = el("select", { id: "network-select", "aria-label": "Network" });
    nets.forEach(function (item) {
      var option = el("option", { value: item.id }, item.name);
      if (item.id === state.ctx.network) option.selected = true;
      select.append(option);
    });
    select.addEventListener("change", function () {
      openId = "";
      var next = ensureOffer(C.setContext(state, { network: select.value }));
      if (next.a && next.a.retailerId && (next.a.planChoiceId || next.a.source === "plan-doc")) {
        if (planPinned) next = reapplyPublic(next);
        else {
          appliedBand = "";
          next = applyTenure(next);
        }
      }
      commit(next);
    });
    label.append(select);
    host.append(label);
  }

  function paintCustomer() {
    var host = document.getElementById("customer");
    var focus = document.activeElement;
    var focusId = focus && host.contains(focus) ? focus.id : "";
    var caret = focus && typeof focus.selectionStart === "number" ? focus.selectionStart : null;
    host.replaceChildren();
    host.append(el("h2", {}, "Customer"));

    if (!stateLocked) {
      host.append(el("p", { class: "note" }, "Pick the state, or type a postcode in the notes. Retailers and rates stay hidden until the state is known."));
    }

    if (stateLocked) {
    host.append(el("label", { for: "retailer-select" }, "Retailer"));
    var retailerSelect = el("select", { id: "retailer-select" });
    retailerSelect.append(el("option", { value: "" }, "Choose a retailer"));
    retailersNow().forEach(function (retailer) {
      var option = el("option", { value: retailer.id }, retailer.name);
      if (retailer.id === state.a.retailerId) option.selected = true;
      retailerSelect.append(option);
    });
    retailerSelect.addEventListener("change", function () {
      if (!retailerSelect.value) {
        commit(Object.assign({}, state, { a: C.emptySide() }));
        return;
      }
      setRetailer(retailerSelect.value);
    });
    host.append(retailerSelect);

    if (state.a.retailerId) {
    host.append(el("label", { for: "plan-select" }, "Plan"));
    var planSelect = el("select", { id: "plan-select" });
    planSelect.append(el("option", { value: "" }, "Choose a plan"));
    var retailer = D.retailerById(state.a.retailerId);
    var published = window.QCPublic ? QCPublic.matching(retailer.id, state.ctx) : [];
    if (retailer) {
      published.forEach(function (plan) {
        var option = el("option", { value: plan.id }, plan.name);
        if (plan.id === state.a.planChoiceId) option.selected = true;
        planSelect.append(option);
      });
    }
    if (retailer && !published.length) host.append(el("p", { class: "note" }, retailer.name + " has not published a price for this tariff on the rate card Quick Compare can read."));
    planSelect.addEventListener("change", function () {
      if (!planSelect.value) {
        planPinned = true;
        commit(clearPlan(state));
        return;
      }
      setPlan(planSelect.value);
    });
    host.append(planSelect);
    }
    }

    host.append(el("label", { for: "notes" }, "Notes"));
    var notesInput = el("textarea", {
      id: "notes",
      rows: "3",
      placeholder: "How long have they been with this retailer?"
    });
    notesInput.value = notes;
    notesInput.addEventListener("input", function () {
      var previous = C.readNoteFacts(notes, new Date());
      notes = notesInput.value;
      var nextRead = C.readNoteFacts(notes, new Date());
      var previousBand = previous.tenure ? previous.tenure.band : "";
      var nextBand = nextRead.tenure ? nextRead.tenure.band : "";
      var sameFacts = JSON.stringify({
        c: previous.customer, p: previous.postcode, t: previous.tariffFamily, u: previous.usageLevel, b: previous.bill, r: previous.retailerId
      }) === JSON.stringify({
        c: nextRead.customer, p: nextRead.postcode, t: nextRead.tariffFamily, u: nextRead.usageLevel, b: nextRead.bill, r: nextRead.retailerId
      });
      if (previousBand === nextBand && sameFacts) {
        save();
        var line = document.getElementById("tenure-read");
        if (line && nextRead.tenure) line.textContent = nextRead.tenure.summary;
        return;
      }
      if (previousBand !== nextBand) {
        planPinned = false;
        appliedBand = "";
      }
      commit(applyTenure(applyFacts(state)));
    });
    host.append(notesInput);
    var tenure = C.readTenure(notes, new Date());
    if (tenure) host.append(el("p", { class: "note", id: "tenure-read" }, tenure.summary));
    var factLine = C.readNoteFacts(notes, new Date());
    if (factLine.applied.length) host.append(el("p", { class: "note", id: "facts-read" }, factLine.applied.join(" ")));

    var showRates = !!(state.a.planChoiceId || state.a.source === "manual" || C.num(state.a.rates[primaryRateKey()]) != null);
    host.append(el("label", { for: "postcode" }, "Postcode"));
    var postcode = el("input", { id: "postcode", inputmode: "numeric", maxlength: "4", autocomplete: "off" });
    postcode.value = state.ctx.postcode || "";
    postcode.addEventListener("change", function () {
      var next = ensureOffer(C.setContext(state, { postcode: postcode.value }));
      openId = "";
      appliedBand = "";
      commit(applyTenure(next));
    });
    host.append(postcode);

    if (stateLocked) {
    host.append(el("label", { for: "tariff-select" }, "Tariff"));
    var tariffSelect = el("select", { id: "tariff-select" });
    var available = D.tariffsAvailable(state.ctx);
    if (!available.length) tariffSelect.append(el("option", { value: "" }, "No plan type on file for this zone"));
    available.forEach(function (tariff) {
      var option = el("option", { value: tariff.id }, tariff.label);
      if (tariff.id === state.ctx.tariff) option.selected = true;
      tariffSelect.append(option);
    });
    tariffSelect.addEventListener("change", function () {
      if (!tariffSelect.value) return;
      var next = C.setContext(state, { tariff: tariffSelect.value });
      openId = "";
      appliedBand = "";
      if (next.a && next.a.retailerId) next = reapplyPublic(next);
      commit(applyTenure(next));
    });
    host.append(tariffSelect);
    var demandRelevant = state.ctx.fuel === "electricity" && (showDemand || /tou|demand|biz-/.test(state.ctx.tariff || ""));
    if (demandRelevant) {
      var demandLabel = el("label", { class: "demand-toggle", for: "demand-toggle" });
      var demandBox = el("input", { type: "checkbox", id: "demand-toggle" });
      demandBox.checked = showDemand;
      demandBox.addEventListener("change", function () {
        showDemand = demandBox.checked;
        if (showDemand && C.num(state.usage.demandKw) == null) {
          state = C.setUsage(state, "demandKw", "15");
        }
        if (showDemand && C.num(state.a.rates.demand) == null) {
          var network = D.networkById(state.ctx.network);
          if (network && network.demand != null) state = C.enterRate(state, "a", "demand", String(network.demand));
        }
        commit(state);
      });
      demandLabel.append(demandBox, document.createTextNode(" Include demand"));
      host.append(demandLabel);
    }
    }
    paintConfirms(host);
    if (noteHint) host.append(el("p", { class: "note" }, noteHint));

    if (stateLocked && showRates) {
      host.append(el("label", {}, "Usage"));
      var levels = el("div", { class: "levels" });
      [["low", "Low"], ["medium", "Medium"], ["high", "High"], ["manual", "Manual"]].forEach(function (pair) {
        var button = el("button", { type: "button", class: usageLevel === pair[0] ? "is-on" : "" }, pair[1]);
        button.addEventListener("click", function () { setLevel(pair[0]); });
        levels.append(button);
      });
      host.append(levels);
      var usageInput = el("input", {
        id: "usage-input",
        inputmode: "decimal",
        autocomplete: "off",
        "aria-label": "Usage " + usageUnit()
      });
      usageInput.value = state.usage[usageKey()] != null ? String(state.usage[usageKey()]) : "";
      usageInput.addEventListener("input", function () {
        usageLevel = "manual";
        usageTouched = true;
        var next = C.setUsage(state, usageKey(), usageInput.value);
        var read = C.readTenure(notes, new Date());
        if (read && read.band === "best" && !planPinned) {
          appliedBand = "";
          next = applyTenure(next);
        }
        commit(next);
      });
      host.append(usageInput);

      rateFields().forEach(function (field) {
        host.append(el("label", { for: "rate-" + field.key }, field.label));
        var input = el("input", { id: "rate-" + field.key, inputmode: "decimal", autocomplete: "off" });
        input.value = state.a.rates[field.key] != null ? String(state.a.rates[field.key]) : "";
        input.addEventListener("input", function () {
          var next = C.enterRate(state, "a", field.key, input.value);
          if (next === state) return;
          commit(next);
        });
        host.append(input);
      });
      if (showDemand) {
        host.append(el("label", { for: "demand-kw" }, "Demand kW"));
        var kwInput = el("input", { id: "demand-kw", inputmode: "decimal", autocomplete: "off" });
        kwInput.value = state.usage.demandKw != null ? String(state.usage.demandKw) : "15";
        kwInput.addEventListener("input", function () {
          usageTouched = true;
          commit(C.setUsage(state, "demandKw", kwInput.value));
        });
        host.append(kwInput);
      }

    host.append(el("label", {}, "GST"));
    var gst = el("div", { class: "gst" });
    var inc = el("input", { type: "radio", name: "gst", id: "gst-inc" });
    inc.checked = state.a.gstInclusive !== false;
    inc.addEventListener("change", function () { if (inc.checked) commit(withGst(state, true)); });
    var exc = el("input", { type: "radio", name: "gst", id: "gst-exc" });
    exc.checked = state.a.gstInclusive === false;
    exc.addEventListener("change", function () { if (exc.checked) commit(withGst(state, false)); });
    var incLabel = el("label", { for: "gst-inc" });
    incLabel.append(inc, document.createTextNode(" Including GST"));
    var excLabel = el("label", { for: "gst-exc" });
    excLabel.append(exc, document.createTextNode(" Excluding GST"));
    gst.append(incLabel, excLabel);
    host.append(gst);
    }

    if (focusId) {
      var again = document.getElementById(focusId);
      if (again) {
        again.focus();
        if (caret != null && again.setSelectionRange) {
          var pos = Math.min(caret, String(again.value || "").length);
          again.setSelectionRange(pos, pos);
        }
      }
    }
  }

  function paintConfirms(host) {
    var facts = C.readNoteFacts(notes, new Date());
    facts.uncertain.forEach(function (item) {
      if (dismissed[item.id]) return;
      var row = el("p", { class: "confirm" });
      row.append(document.createTextNode(item.question + " "));
      if (item.kind === "bill") {
        ["month", "quarter", "year"].forEach(function (period) {
          var yes = el("button", { type: "button", class: "view" }, period);
          yes.addEventListener("click", function () {
            noteBill = { amount: item.amount, period: period, certain: true };
            dismissed[item.id] = true;
            save();
            paint();
          });
          row.append(yes);
        });
      } else {
        var yes = el("button", { type: "button", class: "view" }, "Use");
        yes.addEventListener("click", function () {
          dismissed[item.id] = true;
          C.readNoteFacts(notes, new Date()).uncertain.forEach(function (other) {
            if (other.kind === item.kind) dismissed[other.id] = true;
          });
          var next = state;
          if (item.kind === "postcode") next = ensureOffer(C.setContext(state, { postcode: item.value }));
          if (item.kind === "tariff") {
            var pickedTariff = tariffForFamily(state.ctx, item.value);
            if (pickedTariff) next = C.setContext(state, { tariff: pickedTariff });
            else noteHint = "That tariff is not on file for this distribution zone, so it was left off the list.";
          }
          if (item.kind === "retailer") {
            var namedRetailer = D.retailerById(item.value);
            if (namedRetailer && D.offerExists(namedRetailer, state.ctx)) {
              planPinned = false;
              appliedBand = "";
              next = C.selectCurrentRetailer(next, { id: namedRetailer.id, name: namedRetailer.name, custom: false });
            }
          }
          if (item.kind === "customer" && item.value) next = ensureOffer(C.setContext(next, { customer: item.value }));
          commit(applyTenure(next));
        });
        row.append(yes);
      }
      var skip = el("button", { type: "button", class: "back" }, "Skip");
      skip.addEventListener("click", function () {
        dismissed[item.id] = true;
        save();
        paint();
      });
      row.append(skip);
      host.append(row);
    });
  }

  function bestFor(retailerId, planId) {
    if (!window.QCPublic) return null;
    var retailer = D.retailerById(retailerId);
    if (!retailer || !D.serves(retailer, state.ctx)) return null;
    var plans = QCPublic.matching(retailerId, state.ctx);
    var chosen = null;
    if (planId) plans.forEach(function (plan) { if (plan.id === planId) chosen = plan; });
    var usage = C.resolveUsage(state);
    var best = null;
    (chosen ? [chosen] : plans).forEach(function (plan) {
      var bundle = QCPublic.toBundle(plan, retailer);
      var side = C.sideFromBundle(bundle, "plan-doc");
      var cost = C.annualCost(state.ctx.tariff, side, usage.resolved);
      if (!cost.complete) return;
      if (!best || cost.normalised < best.cost.normalised) best = { retailer: retailer, bundle: bundle, side: side, cost: cost, plan: plan };
    });
    return best;
  }

  function challengerSide(row, letter) {
    var mark = D.tableMark(row.retailer.id);
    return {
      letter: letter,
      name: row.retailer.name,
      planName: row.bundle.planName || "",
      retailerId: row.retailer.id,
      rates: row.side.rates || {},
      gstInclusive: true,
      contract: row.bundle.contract || "",
      exitNote: row.bundle.exitNote || "",
      quoteUrl: row.bundle.quoteUrl || "",
      ours: mark === "ours" || mark === "both"
    };
  }

  function openCompare(row) {
    if (window.QCCompare) window.QCCompare.reset();
    compareWith = row.retailer.id;
    comparePlanId = row.plan ? row.plan.id : "";
    if (compareExtra === compareWith || compareExtra === state.a.retailerId) compareExtra = "";
    save();
    paint();
  }

  function closeCompare() {
    compareWith = "";
    compareExtra = "";
    comparePlanId = "";
    save();
    paint();
  }

  function paintOverlay() {
    var host = document.getElementById("overlay");
    if (!host) return;
    if (!compareWith) {
      host.hidden = true;
      host.replaceChildren();
      return;
    }
    var challenger = bestFor(compareWith, comparePlanId);
    if (!challenger) {
      compareWith = "";
      compareExtra = "";
      host.hidden = true;
      host.replaceChildren();
      return;
    }
    var extra = compareExtra ? bestFor(compareExtra) : null;
    if (compareExtra && !extra) compareExtra = "";
    var taken = [state.a.retailerId || "", compareWith, compareExtra];
    var choices = D.RETAILERS.filter(function (retailer) {
      return taken.indexOf(retailer.id) === -1 && D.offerExists(retailer, state.ctx);
    }).sort(function (a, b) {
      var ao = D.OURS.indexOf(a.id) === -1 ? 1 : 0;
      var bo = D.OURS.indexOf(b.id) === -1 ? 1 : 0;
      if (ao !== bo) return ao - bo;
      return a.name.localeCompare(b.name);
    });
    var sides = [
      {
        letter: "A",
        name: state.a.name || "Current plan",
        planName: state.a.planLabel || state.a.planName || "Rates as entered",
        retailerId: state.a.retailerId || "",
        rates: state.a.rates || {},
        gstInclusive: state.a.gstInclusive !== false,
        ours: false
      },
      challengerSide(challenger, "B")
    ];
    if (extra) sides.push(challengerSide(extra, "C"));
    host.hidden = false;
    window.QCCompare.render(host, {
      ctx: state.ctx,
      usage: state.usage,
      usageLevel: usageLevel,
      notes: notes,
      nmi: C.readNoteFacts(notes, new Date()).nmi,
      bill: noteBill,
      sides: sides,
      choices: choices.map(function (retailer) { return { id: retailer.id, name: retailer.name, ours: D.OURS.indexOf(retailer.id) !== -1 }; }),
      onClose: closeCompare,
      onLevel: function (level) { setLevel(level); },
      onUsage: function (nextUsage) {
        usageLevel = "manual";
        usageTouched = true;
        commit(Object.assign({}, state, { usage: Object.assign({}, state.usage, nextUsage) }));
      },
      onAdd: function (id) {
        compareExtra = id || "";
        save();
        paint();
      },
      showDemand: showDemand,
      onDemand: function (on) {
        showDemand = !!on;
        if (showDemand && C.num(state.usage.demandKw) == null) state = C.setUsage(state, "demandKw", "15");
        if (showDemand && C.num(state.a.rates.demand) == null) {
          var network = D.networkById(state.ctx.network);
          if (network && network.demand != null) state = C.enterRate(state, "a", "demand", String(network.demand));
        }
        commit(state);
      }
    });
  }

  function viewButton(row) {
    var mark = D.tableMark(row.retailer.id);
    var button = el("button", {
      type: "button",
      class: "view" + (mark === "sell" || mark === "both" ? " is-sell" : mark === "ours" ? " is-ours" : "")
    }, "Compare");
    button.addEventListener("click", function () { openCompare(row); });
    return button;
  }

  function paintRank(board, built) {
    var mine = customerCost(built.usage);
    var bestOther = null;
    built.rows.forEach(function (row) {
      if (row.retailer.id === state.a.retailerId || !row.cost || !row.cost.complete) return;
      if (!bestOther || row.cost.normalised < bestOther.cost.normalised) bestOther = row;
    });
    var recommend = el("p", { class: "recommend" });
    if (mine && bestOther) {
      var gap = mine.normalised - bestOther.cost.normalised;
      var pct = mine.normalised ? Math.round(gap / mine.normalised * 100) : 0;
      if (gap > 0) {
        recommend.textContent = "Recommended: " + bestOther.retailer.name + " — " + displayMoney(bestOther.cost.normalised) + " a year, " + pct + "% under the current plan. It moves when usage changes.";
      } else {
        recommend.textContent = "The current plan is the cheapest on this list for the usage entered.";
      }
    } else if (built.rows.length) {
      var top = sortAsc ? built.rows[0] : built.rows[built.rows.length - 1];
      recommend.textContent = "Cheapest on this list: " + top.retailer.name + " — " + displayMoney(top.cost.normalised) + " a year, before a customer plan is chosen.";
    }
    if (recommend.textContent) board.append(recommend);

    var fields = rateFields();
    var toolbar = el("div", { class: "board-tools" });
    var sortBtn = el("button", { type: "button", class: "change-state" }, sortAsc ? "Lowest cost first" : "Highest cost first");
    sortBtn.addEventListener("click", function () {
      sortAsc = !sortAsc;
      save();
      paint();
    });
    toolbar.append(sortBtn);
    board.append(toolbar);

    var currentOnly = null;
    var oursOnly = [];
    var otherRows = [];
    built.rows.forEach(function (row) {
      var mark = D.tableMark(row.retailer.id);
      var ours = mark === "ours" || mark === "both";
      if (ours) oursOnly.push(row);
      else if (row.retailer.id === state.a.retailerId) currentOnly = row;
      else otherRows.push(row);
    });
    var list = el("div", { class: "retailer-list" });
    if (currentOnly) paintCard(currentOnly);
    if (oursOnly.length) list.append(el("h3", { class: "list-label" }, "Our retailers"));
    oursOnly.forEach(function (row) { paintCard(row); });
    if (otherRows.length && appearance.layout !== "focus") {
      var rest = el("details", { class: "other-retailers" });
      rest.append(el("summary", {}, "Other retailers (" + otherRows.length + ")"));
      var restList = el("div", { class: "retailer-list" });
      otherRows.forEach(function (row) { restList.append(paintCard(row, true)); });
      rest.append(restList);
      list.append(rest);
    }
    board.append(list);

    function paintCard(row, quiet) {
      var mark = D.tableMark(row.retailer.id);
      var ours = mark === "ours" || mark === "both";
      var current = row.retailer.id === state.a.retailerId;
      var card = el("article", { class: "retailer-card" + (ours ? " is-ours" : "") + (current ? " is-current" : "") + (mark === "sell" ? " is-sell" : "") });
      var top = el("div", { class: "card-top" });
      var identity = el("div");
      identity.append(el("h2", { class: ours ? "ink-ours" : "" }, row.retailer.name));
      if (row.plan) identity.append(el("p", { class: "plan-name" }, row.plan.name));
      var badges = el("div", { class: "badges" });
      if (ours) badges.append(el("span", { class: "badge badge-ours" }, "Our retailer"));
      if (mark === "sell" || mark === "both") badges.append(el("span", { class: "badge badge-sell" }, "Selling"));
      if (current) badges.append(el("span", { class: "badge badge-current" }, "Current"));
      identity.append(badges);
      var figures = el("div", { class: "card-money" });
      if (row.publicMissing || !row.cost || !row.cost.complete) {
        figures.append(el("p", { class: "card-year" }, "No published rate"));
        figures.append(el("p", { class: "card-ref" }, "Nothing on this retailer's public price page matches this tariff."));
      } else if (row.plan && /free usage/i.test(row.plan.windows || "")) {
        figures.append(el("p", { class: "card-year" }, displayMoney(row.cost.normalised) + " / year"));
        figures.append(el("p", { class: "card-ref" }, "Year figure leaves out the free usage window on this offer."));
      } else {
        figures.append(el("p", { class: "card-year" }, displayMoney(row.cost.normalised) + " / year"));
        figures.append(el("p", { class: "card-ref" }, comparisonText(row.cost, built.refCost)));
      }
      if (mine && row.cost && row.cost.complete && row.retailer.id !== state.a.retailerId) {
        var gap = mine.normalised - row.cost.normalised;
        var pct = mine.normalised ? Math.round(gap / mine.normalised * 100) : 0;
        var versus = gap > 0 ? pct + "% under current" : gap < 0 ? Math.abs(pct) + "% over current" : "Same as current";
        figures.append(el("p", { class: gap > 0 ? "ink-better" : gap < 0 ? "ink-worse" : "card-ref" }, versus));
      }
      top.append(identity, figures);
      if (!row.publicMissing && row.cost && row.cost.complete) top.append(viewButton(row));
      var grid = el("div", { class: "rate-grid" });
      fields.forEach(function (field) {
        var retailerInc = inclusiveCents(row.side, field.key);
        var customerInc = mine ? inclusiveCents(state.a, field.key) : null;
        var lowerIsBetter = field.kind !== "higher";
        var cell = el("div", { class: "rate-cell" });
        cell.append(el("span", {}, field.label));
        cell.append(el("strong", { class: inkForRate(mark, retailerInc, customerInc, lowerIsBetter) }, displayField(field, retailerInc)));
        if (mine && customerInc && retailerInc != null && customerInc !== 0) {
          var ratePct = Math.round((customerInc - retailerInc) / Math.abs(customerInc) * 100);
          var rateWord = lowerIsBetter
            ? (ratePct > 0 ? ratePct + "% lower" : Math.abs(ratePct) + "% higher")
            : (ratePct < 0 ? Math.abs(ratePct) + "% higher credit" : ratePct + "% lower credit");
          cell.append(el("em", { class: inkForRate(mark, retailerInc, customerInc, lowerIsBetter) }, rateWord));
        }
        grid.append(cell);
      });
      card.append(top, grid);
      if (row.bundle && row.bundle.exitNote) card.append(el("p", { class: "note" }, row.bundle.exitNote));
      if (row.bundle && row.bundle.note) card.append(el("p", { class: "note" }, row.bundle.note));
      var rateLink = (row.bundle && row.bundle.quoteUrl) || row.retailer.quoteUrl;
      if (rateLink) card.append(el("a", { class: "rate-link", href: rateLink, target: "_blank", rel: "noopener" }, "Rates on the " + row.retailer.name + " website"));
      if (!quiet) list.append(card);
      return card;
    }
    if (!built.rows.length) {
      var empty = "No reference plan matches this state.";
      if (state.ctx.fuel === "gas" && state.ctx.region === "NT") empty = "No reference gas market is included for the Northern Territory.";
      else if (built.offerMissing) empty = "No plan of this type is on file for this postcode or distribution zone, so those retailers are hidden.";
      else if (built.hiddenWorse) empty = "Every retailer with this plan is dearer on both the usage rate and the daily charge, so they are hidden.";
      board.append(el("p", { class: "note" }, empty));
    }
  }

  function paintPlans(board, retailer) {
    board.append(el("button", { type: "button", class: "back" }, "All retailers"));
    board.lastChild.addEventListener("click", function () {
      openId = "";
      save();
      paint();
    });
    board.append(el("p", { class: "recommend" }, retailer.name + " plans on file for this state"));
    var table = el("table", { class: "plans" });
    var head = el("tr");
    ["Plan", state.ctx.fuel === "gas" ? "Usage" : "General Usage", "Daily Charge", "Cost / Year", "Benefits, discounts and credits"].forEach(function (label) {
      head.append(el("th", {}, label));
    });
    table.append(el("thead", {}, ""));
    table.tHead.append(head);
    var body = el("tbody");
    var usage = C.resolveUsage(state);
    var published = window.QCPublic ? QCPublic.matching(retailer.id, state.ctx) : [];
    var plans = [];
    published.forEach(function (plan) {
      var bundle = QCPublic.toBundle(plan, retailer);
      var side = C.sideFromBundle(bundle, "plan-doc");
      var cost = C.annualCost(state.ctx.tariff, side, usage.resolved);
      if (!cost.complete) return;
      plans.push({ choice: { label: plan.name }, bundle: bundle, side: side, cost: cost });
    });
    plans.sort(function (a, b) { return a.cost.normalised - b.cost.normalised; });
    plans.forEach(function (plan) {
      var tr = el("tr");
      tr.append(el("td", {}, plan.choice.label));
      tr.append(el("td", {}, displayCents(inclusiveCents(plan.side, rateKey()))));
      tr.append(el("td", {}, displayCents(inclusiveCents(plan.side, "supply"))));
      tr.append(el("td", {}, displayMoney(plan.cost.normalised)));
      var detail = el("td");
      var benefit = el("p", { class: "benefit" });
      benefit.append(el("strong", {}, "Benefit period. "));
      benefit.append(document.createTextNode(plan.bundle.contract || "Not on file."));
      var credit = el("p", { class: "benefit" });
      credit.append(el("strong", {}, "Credits and exit. "));
      credit.append(document.createTextNode(plan.bundle.exitNote || "Not on file."));
      detail.append(benefit, credit);
      if (plan.bundle.quoteUrl) {
        var link = el("a", { href: plan.bundle.quoteUrl, target: "_blank", rel: "noopener" }, "Open " + retailer.name + " plans");
        detail.append(link);
      }
      tr.append(detail);
      body.append(tr);
    });
    table.append(body);
    board.append(table);
  }

  function paintBoard() {
    var board = document.getElementById("board");
    board.replaceChildren();
    if (!stateLocked) return;
    openId = "";
    paintRank(board, homeRows());
  }

  function paintFine() {
    var host = document.getElementById("fine");
    if (!stateLocked) {
      host.textContent = "";
      return;
    }
    var built = homeRows();
    var usage = built.usage.resolved[usageKey()];
    host.textContent = "Ranked on " + (usage != null ? Number(usage).toLocaleString("en-AU") : "the") + " " + usageUnit() + ". " + D.DISCLAIMER;
  }

  function paint() {
    paintFuels();
    paintStates();
    paintSubtitle();
    paintBoard();
    paintCustomer();
    paintFine();
    paintOverlay();
  }

  function paintSettings() {
    var button = document.getElementById("settings-button");
    var panel = document.getElementById("settings-panel");
    if (!button || !panel) return;
    var themes = [["warm", "Warm"], ["daylight", "Daylight"], ["night", "Night"]];
    var layouts = [["cards", "Cards"], ["compact", "Compact"], ["focus", "Ours only"]];
    function fill(host, options, key) {
      host.replaceChildren();
      options.forEach(function (pair) {
        var choice = el("button", { type: "button", class: appearance[key] === pair[0] ? "is-on" : "", "aria-pressed": appearance[key] === pair[0] ? "true" : "false" }, pair[1]);
        choice.addEventListener("click", function (event) {
          event.stopPropagation();
          appearance[key] = pair[0];
          saveAppearance();
          fill(host, options, key);
          paint();
        });
        host.append(choice);
      });
    }
    fill(document.getElementById("theme-choices"), themes, "theme");
    fill(document.getElementById("layout-choices"), layouts, "layout");
    button.addEventListener("click", function () {
      var open = panel.hasAttribute("hidden");
      if (open) panel.removeAttribute("hidden");
      else panel.setAttribute("hidden", "");
      button.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.addEventListener("click", function (event) {
      if (panel.hasAttribute("hidden")) return;
      if (panel.contains(event.target) || button.contains(event.target)) return;
      panel.setAttribute("hidden", "");
      button.setAttribute("aria-expanded", "false");
    });
  }

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    var panel = document.getElementById("settings-panel");
    if (panel && !panel.hasAttribute("hidden")) {
      panel.setAttribute("hidden", "");
      var button = document.getElementById("settings-button");
      if (button) button.setAttribute("aria-expanded", "false");
      return;
    }
    if (compareWith) closeCompare();
  });

  paintSettings();

  if (!state.usage[usageKey()] && !usageTouched) {
    state = fillUsage(state);
    save();
  }
  paint();
})();
