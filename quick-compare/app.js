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
      appliedRetailer: ""
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
        appliedRetailer: saved.appliedRetailer || ""
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
        appliedRetailer: appliedRetailer
      }));
    } catch (err) { /* private mode */ }
  }

  function commit(next) {
    state = next;
    save();
    paint();
  }

  function rateKey() {
    return state.ctx.fuel === "gas" ? "gasUsage" : "usage";
  }

  function usageKey() {
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

  function referenceSide(ctx) {
    var side = C.emptySide();
    side.gstInclusive = true;
    if (ctx.fuel === "gas") {
      var region = D.REGIONS[ctx.region];
      if (!region || !region.gas) return null;
      side.rates = { supply: region.gas.supply, gasUsage: region.gas.usage };
      return side;
    }
    var network = D.networkById(ctx.network);
    if (!network || !network.flat) return null;
    side.rates = { usage: network.flat.usage, supply: network.flat.supply };
    return side;
  }

  function homeRows() {
    var usage = C.resolveUsage(state);
    var ref = referenceSide(state.ctx);
    var refCost = ref ? C.annualCost(state.ctx.tariff, ref, usage.resolved) : null;
    var rows = [];
    D.RETAILERS.forEach(function (retailer) {
      if (!D.serves(retailer, state.ctx)) return;
      var best = null;
      D.rankVariants(retailer, state.ctx).forEach(function (variant) {
        var bundle = D.buildReferencePlan(retailer.id, state.ctx, variant);
        if (!bundle) return;
        var side = C.sideFromBundle(bundle, "live");
        var cost = C.annualCost(state.ctx.tariff, side, usage.resolved);
        if (!cost.complete) return;
        if (!best || cost.normalised < best.cost.normalised) {
          best = { retailer: retailer, bundle: bundle, side: side, cost: cost };
        }
      });
      if (best) rows.push(best);
    });
    rows.sort(function (a, b) {
      var diff = a.cost.normalised - b.cost.normalised;
      if (!sortAsc) diff = -diff;
      if (diff) return diff;
      return a.retailer.name.localeCompare(b.retailer.name);
    });
    return { rows: rows, usage: usage, refCost: refCost && refCost.complete ? refCost : null };
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
    if (!side || !side.name || C.num(side.rates[rateKey()]) == null || C.num(side.rates.supply) == null) return null;
    var cost = C.annualCost(state.ctx.tariff, side, usage.resolved);
    return cost.complete ? cost : null;
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
    var retailer = D.retailerById(current.a && current.a.retailerId);
    if (!retailer) return null;
    var choices = D.planChoices(retailer, current.ctx.tariff);
    if (!choices.length) return null;
    if (band === "standing") {
      var standing = null;
      choices.forEach(function (choice) {
        if (choice.variant === "standing" && !standing) standing = choice;
      });
      if (standing) return standing;
      choices.forEach(function (choice) {
        if (choice.variant === "market" && !standing) standing = choice;
      });
      return standing || choices[0];
    }
    if (band === "market") {
      var market = null;
      choices.forEach(function (choice) {
        if (choice.variant === "market" && !market) market = choice;
      });
      return market || choices[0];
    }
    var usage = C.resolveUsage(current);
    var best = null;
    var bestCost = Infinity;
    choices.forEach(function (choice) {
      if (choice.variant === "standing") return;
      var bundle = D.buildReferencePlan(retailer.id, current.ctx, choice.variant, choice);
      if (!bundle) return;
      var side = C.sideFromBundle(bundle, "database");
      var cost = C.annualCost(current.ctx.tariff, side, usage.resolved);
      if (!cost.complete) return;
      if (cost.normalised < bestCost) {
        bestCost = cost.normalised;
        best = choice;
      }
    });
    return best;
  }

  function applyTenure(current) {
    var read = C.readTenure(notes, new Date());
    if (!read || planPinned || !current.a || !current.a.retailerId) {
      if (!read) {
        appliedBand = "";
        appliedRetailer = "";
      }
      return current;
    }
    var choice = choiceForBand(current, read.band);
    if (!choice) return current;
    if (current.a.planChoiceId === choice.id && appliedBand === read.band && appliedRetailer === current.a.retailerId) return current;
    var keepInc = current.a.gstInclusive !== false;
    var next = C.selectPlan(current, choice.id);
    if (!keepInc) next = withGst(next, false);
    if (!usageTouched) next = fillUsage(next);
    appliedBand = read.band;
    appliedRetailer = current.a.retailerId;
    return next;
  }

  function setFuel(fuel) {
    var tariff = fuel === "gas" ? "gas-single" : "single";
    var next = C.setContext(state, { fuel: fuel, tariff: tariff, customer: "residential" });
    if (next.a && next.a.retailerId && !D.serves(D.retailerById(next.a.retailerId), next.ctx)) {
      next = Object.assign({}, next, { a: C.emptySide() });
    }
    usageTouched = false;
    openId = "";
    appliedBand = "";
    next = fillUsage(next);
    next = applyTenure(next);
    commit(next);
  }

  function setRegion(region) {
    var next = C.setContext(state, { region: region });
    if (next.a && next.a.retailerId) {
      var retailer = D.retailerById(next.a.retailerId);
      if (!retailer || !D.serves(retailer, next.ctx)) {
        next = Object.assign({}, next, { a: C.emptySide() });
      } else if (next.a.planChoiceId) {
        var keepInc = next.a.gstInclusive !== false;
        next = C.selectPlan(next, next.a.planChoiceId);
        if (!keepInc) next = withGst(next, false);
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
    var keepInc = !state.a || state.a.gstInclusive !== false;
    var next = C.selectPlan(state, choiceId);
    if (!keepInc) next = withGst(next, false);
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
    if (mark === "ours") return "ink-blue";
    return "";
  }

  function paintFuels() {
    var host = document.getElementById("fuels");
    host.replaceChildren();
    [["electricity", "Electricity"], ["gas", "Gas"]].forEach(function (pair) {
      var button = el("button", { type: "button", class: state.ctx.fuel === pair[0] ? "is-on" : "" }, pair[1]);
      button.addEventListener("click", function () { setFuel(pair[0]); });
      host.append(button);
    });
  }

  function paintStates() {
    var host = document.getElementById("states");
    host.replaceChildren();
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
    var region = D.REGIONS[state.ctx.region];
    var place = region ? region.name : state.ctx.region;
    host.replaceChildren();
    if (state.ctx.fuel === "gas") {
      host.textContent = "Cheapest gas by retailer — " + place;
      return;
    }
    var nets = D.networksFor(state.ctx.region);
    var network = D.networkById(state.ctx.network);
    if (nets.length < 2) {
      host.textContent = "Cheapest electricity by retailer — " + place + (network ? ", " + network.name : "");
      return;
    }
    host.append(document.createTextNode("Cheapest electricity by retailer — " + place + ", "));
    var label = el("label", { class: "network" });
    var select = el("select", { id: "network-select", "aria-label": "Network" });
    nets.forEach(function (item) {
      var option = el("option", { value: item.id }, item.name);
      if (item.id === state.ctx.network) option.selected = true;
      select.append(option);
    });
    select.addEventListener("change", function () {
      openId = "";
      var next = C.setContext(state, { network: select.value });
      if (next.a && next.a.retailerId && next.a.planChoiceId) {
        if (planPinned) {
          var keepInc = next.a.gstInclusive !== false;
          next = C.selectPlan(next, next.a.planChoiceId);
          if (!keepInc) next = withGst(next, false);
        } else {
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

    host.append(el("label", { for: "plan-select" }, "Plan"));
    var planSelect = el("select", { id: "plan-select" });
    planSelect.disabled = !state.a.retailerId;
    planSelect.append(el("option", { value: "" }, state.a.retailerId ? "Choose a plan" : "Choose a retailer first"));
    var retailer = D.retailerById(state.a.retailerId);
    if (retailer) {
      D.planChoices(retailer, state.ctx.tariff).forEach(function (choice) {
        var option = el("option", { value: choice.id }, choice.label);
        if (choice.id === state.a.planChoiceId) option.selected = true;
        planSelect.append(option);
      });
    }
    planSelect.addEventListener("change", function () {
      if (!planSelect.value) {
        planPinned = true;
        commit(C.selectPlan(state, ""));
        return;
      }
      setPlan(planSelect.value);
    });
    host.append(planSelect);

    host.append(el("label", { for: "notes" }, "Notes"));
    var notesInput = el("textarea", {
      id: "notes",
      rows: "3",
      placeholder: "How long have they been with this retailer?"
    });
    notesInput.value = notes;
    notesInput.addEventListener("input", function () {
      var previous = C.readTenure(notes, new Date());
      notes = notesInput.value;
      var nextRead = C.readTenure(notes, new Date());
      var previousBand = previous ? previous.band : "";
      var nextBand = nextRead ? nextRead.band : "";
      if (previousBand === nextBand) {
        save();
        var line = document.getElementById("tenure-read");
        if (line && nextRead) line.textContent = nextRead.summary;
        return;
      }
      planPinned = false;
      appliedBand = "";
      commit(applyTenure(state));
    });
    host.append(notesInput);
    var tenure = C.readTenure(notes, new Date());
    host.append(el("p", { class: "note", id: "tenure-read" }, tenure ? tenure.summary : "A time here is a soft match. Within 6 months uses the best plan. A year or more uses the standing offer, equal to the reference price. Residential rates are reviewed on 1 July."));

    var showRates = !!(state.a.planChoiceId || state.a.source === "manual" || C.num(state.a.rates[rateKey()]) != null);
    if (showRates) {
      host.append(el("label", { for: "usage-input" }, "Usage"));
      var usageInput = el("input", {
        id: "usage-input",
        inputmode: "decimal",
        autocomplete: "off",
        "aria-label": "Usage " + usageUnit()
      });
      usageInput.value = state.usage[usageKey()] != null ? String(state.usage[usageKey()]) : "";
      usageInput.addEventListener("input", function () {
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
      host.append(el("p", { class: "note" }, usageUnit() + ". Filled from the plan’s benchmark until you edit it."));

      host.append(el("label", { for: "rate-usage" }, state.ctx.fuel === "gas" ? "Usage rate" : "General usage"));
      var usageRate = el("input", { id: "rate-usage", inputmode: "decimal", autocomplete: "off" });
      usageRate.value = state.a.rates[rateKey()] != null ? String(state.a.rates[rateKey()]) : "";
      usageRate.addEventListener("input", function () {
        var next = C.enterRate(state, "a", rateKey(), usageRate.value);
        if (next === state) return;
        commit(next);
      });
      host.append(usageRate);

      host.append(el("label", { for: "rate-supply" }, "Daily charge"));
      var supplyRate = el("input", { id: "rate-supply", inputmode: "decimal", autocomplete: "off" });
      supplyRate.value = state.a.rates.supply != null ? String(state.a.rates.supply) : "";
      supplyRate.addEventListener("input", function () {
        var next = C.enterRate(state, "a", "supply", supplyRate.value);
        if (next === state) return;
        commit(next);
      });
      host.append(supplyRate);
      host.append(el("p", { class: "note" }, "Cents, filled when you choose the plan. Edit them to match the bill."));
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

  function viewButton(row) {
    var mark = D.tableMark(row.retailer.id);
    var button = el("button", { type: "button", class: "view" + (mark === "sell" || mark === "both" ? " is-sell" : "") }, "View");
    button.addEventListener("click", function () {
      openId = row.retailer.id;
      save();
      paint();
    });
    return button;
  }

  function paintRank(board, built) {
    var mine = customerCost(built.usage);
    var bestOther = null;
    built.rows.forEach(function (row) {
      if (row.retailer.id === state.a.retailerId) return;
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

    var table = el("table", { class: "rank" });
    var head = el("thead");
    var hr = el("tr");
    ["Retailer", state.ctx.fuel === "gas" ? "Usage" : "General Usage", "Daily Charge^", "Comparison Price *"].forEach(function (label) {
      hr.append(el("th", {}, label));
    });
    var sortTh = el("th", { class: "sortable" }, "Cost / Year Estimate " + (sortAsc ? "▲" : "▼"));
    sortTh.addEventListener("click", function () {
      sortAsc = !sortAsc;
      save();
      paint();
    });
    hr.append(sortTh);
    hr.append(el("th", {}, "Link to Plans"));
    head.append(hr);
    table.append(head);

    var body = el("tbody");
    var custUsage = inclusiveCents(state.a, rateKey());
    var custSupply = inclusiveCents(state.a, "supply");
    built.rows.forEach(function (row) {
      var mark = D.tableMark(row.retailer.id);
      var tr = el("tr", { class: row.retailer.id === state.a.retailerId ? "is-current" : "" });
      var name = el("td", { class: "name" + (mark === "sell" ? " ink-sell" : mark === "ours" || mark === "both" ? " ink-ours" : "") }, row.retailer.name);
      var usageInc = inclusiveCents(row.side, rateKey());
      var supplyInc = inclusiveCents(row.side, "supply");
      var usageTd = el("td", { class: inkForRate(mark, usageInc, mine ? custUsage : null, true) }, displayCents(usageInc));
      var supplyTd = el("td", { class: inkForRate(mark, supplyInc, mine ? custSupply : null, true) }, displayCents(supplyInc));
      if (mine && custUsage && usageInc != null && custUsage !== 0) {
        var usagePct = Math.round((custUsage - usageInc) / Math.abs(custUsage) * 100);
        usageTd.title = (usagePct > 0 ? usagePct + "% lower" : Math.abs(usagePct) + "% higher") + " than the customer usage rate";
      }
      if (mine && custSupply && supplyInc != null && custSupply !== 0) {
        var supplyPct = Math.round((custSupply - supplyInc) / Math.abs(custSupply) * 100);
        supplyTd.title = (supplyPct > 0 ? supplyPct + "% lower" : Math.abs(supplyPct) + "% higher") + " than the customer daily charge";
      }
      tr.append(name, usageTd, supplyTd);
      tr.append(el("td", {}, comparisonText(row.cost, built.refCost)));
      tr.append(el("td", {}, displayMoney(row.cost.normalised)));
      var linkTd = el("td");
      linkTd.append(viewButton(row));
      tr.append(linkTd);
      body.append(tr);
    });
    table.append(body);
    board.append(table);
    if (!built.rows.length) {
      board.append(el("p", { class: "note" }, state.ctx.fuel === "gas" && state.ctx.region === "NT"
        ? "No reference gas market is included for the Northern Territory."
        : "No reference plan matches this state."));
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
    var choices = D.planChoices(retailer, state.ctx.tariff);
    var plans = [];
    choices.forEach(function (choice) {
      var bundle = D.buildReferencePlan(retailer.id, state.ctx, choice.variant, choice);
      if (!bundle) return;
      var side = C.sideFromBundle(bundle, "live");
      var cost = C.annualCost(state.ctx.tariff, side, usage.resolved);
      if (!cost.complete) return;
      plans.push({ choice: choice, bundle: bundle, side: side, cost: cost });
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
    var retailer = openId ? D.retailerById(openId) : null;
    if (retailer && D.serves(retailer, state.ctx)) paintPlans(board, retailer);
    else {
      openId = "";
      paintRank(board, homeRows());
    }
  }

  function paintFine() {
    var built = homeRows();
    var usage = built.usage.resolved[usageKey()];
    var host = document.getElementById("fine");
    var bits = [];
    bits.push("Ranked on " + (usage != null ? Number(usage).toLocaleString("en-AU") : "the") + " " + usageUnit() + (usageTouched ? " from Customer." : " until Usage is edited."));
    bits.push("Comparison Price is against the " + refWord() + " for this network, including supply.");
    bits.push("^ Daily charge is cents per day.");
    bits.push("Green figures are lower than the customer once a plan is chosen. A green View button is a retailer we sell today, and an orange name is ours. Both lists are empty until those names are set.");
    bits.push(D.DISCLAIMER);
    host.textContent = bits.join(" ");
  }

  function paint() {
    paintFuels();
    paintStates();
    paintSubtitle();
    paintBoard();
    paintCustomer();
    paintFine();
  }

  if (!state.usage[usageKey()] && !usageTouched) {
    state = fillUsage(state);
    save();
  }
  paint();
})();
