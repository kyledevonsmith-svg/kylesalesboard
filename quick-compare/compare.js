"use strict";
/* Comparison overlay. A is the customer. B is the retailer they opened. C is optional. */
(function (root) {
  var D = root.QCData;
  var C = root.QCCalc;
  var draftAmount = "";
  var draftPeriod = "quarter";
  var appliedBill = null;

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        if (key === "class") node.className = attrs[key];
        else if (key === "hidden") node.hidden = !!attrs[key];
        else node.setAttribute(key, attrs[key]);
      });
    }
    if (text != null && text !== "") node.textContent = text;
    return node;
  }

  function money(n) {
    var rounded = Math.round(n);
    var sign = rounded < 0 ? "-" : "";
    return sign + "$" + Math.abs(rounded).toLocaleString("en-AU");
  }

  function cents(n) {
    if (n == null || !isFinite(n)) return "—";
    return n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "c";
  }

  function inclusive(side, key) {
    var n = C.num(side && side.rates ? side.rates[key] : null);
    if (n == null) return null;
    return side.gstInclusive === false ? Math.round(n * 1.1 * 1000) / 1000 : n;
  }

  function sideCost(model, side) {
    var prepared = { rates: {}, gstInclusive: true, retailerId: side.retailerId || "", planName: side.planName || "" };
    Object.keys(side.rates || {}).forEach(function (key) {
      var value = inclusive(side, key);
      if (value != null) prepared.rates[key] = value;
    });
    var cost = C.annualCost(model.ctx.tariff, prepared, C.resolveUsage({ ctx: model.ctx, usage: model.usage, a: prepared, b: C.emptySide() }).resolved);
    if (!model.showDemand || !model.ctx || model.ctx.fuel !== "electricity" || !cost.complete) return cost;
    var tariff = D.tariffById(model.ctx.tariff);
    if (tariff && tariff.fields.some(function (field) { return field.key === "demand"; })) return cost;
    var rate = inclusive(side, "demand");
    if (rate == null) rate = D.demandRate(D.retailerById(side.retailerId), model.ctx);
    var kw = C.num(model.usage && model.usage.demandKw);
    if (kw == null) kw = 15;
    if (rate == null) return cost;
    var extra = rate * kw * 12;
    return Object.assign({}, cost, { normalised: cost.normalised + extra, total: cost.total + extra });
  }

  function compareFields(model) {
    var tariff = D.tariffById(model.ctx.tariff);
    if (!tariff) return [];
    var fields = tariff.fields.filter(function (field) {
      return field.kind !== "text" && field.kind !== "gst" && field.kind !== "limit" && field.per !== "year";
    });
    if (model.showDemand && model.ctx.fuel === "electricity" && !fields.some(function (field) { return field.key === "demand"; })) {
      fields = fields.concat([{ key: "demand", label: "Demand", unit: "$/kW/month", per: "kw-month", kind: "lower" }]);
    }
    return fields;
  }

  function showRate(field, value) {
    if (value == null || !isFinite(value)) return "—";
    if (field.per === "kw-month" || field.per === "year") return "$" + value.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return cents(value);
  }

  function talkingPoints(model, sides, costs, fields) {
    var points = [];
    var a = sides[0];
    var costA = costs[0];
    if (!a || !costA || !costA.complete) {
      points.push("Choose the customer's plan so the cents on the left are theirs. Then read the green numbers as the reason to move.");
      return points;
    }
    var ranked = sides.slice(1).map(function (side, index) {
      return { side: side, cost: costs[index + 1], gap: costA.normalised - (costs[index + 1] && costs[index + 1].complete ? costs[index + 1].normalised : costA.normalised) };
    }).filter(function (item) { return item.cost && item.cost.complete; });
    ranked.sort(function (x, y) { return y.gap - x.gap; });
    var best = ranked[0];
    if (best && best.gap > 0) {
      var pct = costA.normalised ? Math.round(best.gap / costA.normalised * 100) : 0;
      points.push("Open with the saving. " + best.side.name + " is " + money(best.gap) + " a year less, about " + money(best.gap / 12) + " a month, " + pct + "% under " + (a.name || "the current plan") + ".");
    } else if (best) {
      points.push("Be straight. On this usage " + (a.name || "the current plan") + " is the cheaper one. Ask whether more of the bill falls in peak, or whether the bill in front of you is higher than this estimate, before you push a switch.");
    }
    if (ranked.length > 1 && ranked[0].gap > 0 && ranked[1].gap > 0) {
      points.push("If they hesitate on " + ranked[0].side.name + ", " + ranked[1].side.name + " is still " + money(ranked[1].gap) + " a year under the current plan.");
    }
    var wins = [];
    var losses = [];
    fields.forEach(function (field) {
      if (!best) return;
      var left = inclusive(a, field.key);
      var right = inclusive(best.side, field.key);
      if (left == null || right == null || left === 0) return;
      var diff = gapText(left, right, field.kind !== "higher");
      if (!diff.klass) return;
      var line = field.label + " is " + diff.text + " (" + showRate(field, left) + " against " + showRate(field, right) + ")";
      if (diff.klass === "ink-better") wins.push({ line: line, pct: Math.abs(left - right) / Math.abs(left) });
      else losses.push(line);
    });
    wins.sort(function (x, y) { return y.pct - x.pct; });
    if (wins.length) points.push("Point at the biggest rate cut: " + wins[0].line + ".");
    if (losses.length) points.push("If they pick the higher line, answer it: " + losses[0] + ". The yearly total already includes that.");
    if (best && best.side.ours) points.push(best.side.name + " is one of our retailers. You can move them onto it on this call.");
    if (best && best.side.exitNote && /no exit fee/i.test(best.side.exitNote)) points.push("There is no exit fee on this sample. Say you will confirm that on the quote before they sign.");
    if (model.showDemand) {
      var kw = C.num(model.usage.demandKw) || 15;
      points.push("Demand is on, at " + kw + " kW. Read the demand line as dollars per kilowatt each month, then back to the yearly saving so it does not get lost in the cents.");
    }
    points.push("Close by asking them to find the same lines on the bill while you read these figures. The cents include GST unless Excluding GST is selected.");
    return points;
  }

  function gapText(left, right, lowerIsBetter) {
    if (left == null || right == null || left === 0) return { text: "—", klass: "" };
    if (Math.abs((left - right) / left) < 0.0008) return { text: "same", klass: "" };
    var better = lowerIsBetter ? right < left : right > left;
    var pct = Math.round(Math.abs(left - right) / Math.abs(left) * 100);
    var text = lowerIsBetter
      ? (right < left ? pct + "% lower" : pct + "% higher")
      : (right > left ? pct + "% higher credit" : pct + "% lower credit");
    return { text: text, klass: better ? "ink-better" : "ink-worse" };
  }

  function render(host, model) {
    if (model.bill && model.bill.amount && !draftAmount) {
      draftAmount = String(model.bill.amount);
      draftPeriod = model.bill.period || "quarter";
    }
    host.replaceChildren();
    var card = el("div", { class: "overlay-card", role: "dialog", "aria-modal": "true", "aria-label": "Comparison" });
    card.addEventListener("click", function (event) { event.stopPropagation(); });
    var close = el("button", { type: "button", class: "overlay-close" }, "Close");
    close.addEventListener("click", function () { if (model.onClose) model.onClose(); });
    card.append(close);

    var sides = model.sides || [];
    var a = sides[0];
    var others = sides.slice(1);
    var names = others.map(function (side) { return side.name; }).join(" and ");
    card.append(el("h1", {}, (a && a.name ? a.name : "Current") + (names ? " compared with " + names : "")));

    var costs = sides.map(function (side) { return sideCost(model, side); });
    var fields = compareFields(model);
    var bestGap = null;
    others.forEach(function (side, index) {
      var cost = costs[index + 1];
      if (!costs[0] || !costs[0].complete || !cost || !cost.complete) return;
      var gap = costs[0].normalised - cost.normalised;
      if (!bestGap || gap > bestGap.gap) bestGap = { side: side, gap: gap };
    });
    var board = el("div", { class: "scoreboard" });
    sides.forEach(function (side, index) {
      var cost = costs[index];
      var score = el("article", { class: "score" + (bestGap && bestGap.gap > 0 && side === bestGap.side ? " is-best" : "") });
      score.append(el("h2", { class: side.ours ? "ink-ours" : "" }, side.letter + " · " + (side.name || "Plan")));
      score.append(el("p", { class: "year" }, cost && cost.complete ? money(cost.normalised) + " / year" : "Rates needed"));
      if (cost && cost.complete) score.append(el("p", { class: "month" }, money(cost.normalised / 12) + " a month"));
      if (index > 0 && costs[0] && costs[0].complete && cost && cost.complete) {
        var gap = costs[0].normalised - cost.normalised;
        var pct = costs[0].normalised ? Math.round(gap / costs[0].normalised * 100) : 0;
        var line = gap > 0 ? "Save " + money(gap) + " · " + pct + "% under A" : gap < 0 ? money(-gap) + " more than A" : "Same as A";
        score.append(el("p", { class: gap > 0 ? "ink-better" : gap < 0 ? "ink-worse" : "month" }, line));
      }
      score.append(el("p", { class: "month" }, side.planName || ""));
      if (side.ours) score.append(el("p", { class: "month" }, "One of our retailers"));
      board.append(score);
    });
    card.append(board);

    var levels = el("div", { class: "levels" });
    [["low", "Low user"], ["medium", "Medium user"], ["high", "High user"]].forEach(function (pair) {
      var button = el("button", { type: "button", class: model.usageLevel === pair[0] ? "is-on" : "" }, pair[1]);
      button.addEventListener("click", function () { if (model.onLevel) model.onLevel(pair[0]); });
      levels.append(button);
    });
    card.append(levels);

    var billBox = el("div", { class: "bill-box" });
    billBox.append(el("label", { for: "bill-amount" }, "Bill amount"));
    var amount = el("input", { id: "bill-amount", inputmode: "decimal", value: draftAmount });
    amount.addEventListener("input", function () { draftAmount = amount.value; });
    var period = el("select", { id: "bill-period", "aria-label": "Bill period" });
    [["month", "per month"], ["quarter", "per quarter"], ["year", "per year"]].forEach(function (pair) {
      var option = el("option", { value: pair[0] }, pair[1]);
      if (pair[0] === draftPeriod) option.selected = true;
      period.append(option);
    });
    period.addEventListener("change", function () { draftPeriod = period.value; });
    var go = el("button", { type: "button", class: "view is-ours" }, "Work out usage");
    go.addEventListener("click", function () { applyBill(model); });
    billBox.append(amount, period, go);
    if (model.ctx.fuel === "electricity") {
      var demandLabel = el("label", { class: "demand-toggle", for: "compare-demand" });
      var demandBox = el("input", { type: "checkbox", id: "compare-demand" });
      demandBox.checked = !!model.showDemand;
      demandBox.addEventListener("change", function () { if (model.onDemand) model.onDemand(demandBox.checked); });
      demandLabel.append(demandBox, document.createTextNode(" Demand"));
      billBox.append(demandLabel);
    }
    card.append(billBox);
    if (appliedBill && appliedBill.error) card.append(el("p", { class: "confirm" }, appliedBill.error));
    if (appliedBill && appliedBill.annual) {
      card.append(el("p", { class: "note" }, "A " + appliedBill.period + " bill of $" + appliedBill.amount + " works back to about " + appliedBill.annual.toLocaleString("en-AU") + " " + appliedBill.unit + " a year after the daily charge." + (appliedBill.split ? " The bands keep the same shares as the usage already selected." : "")));
    }

    var add = el("div", { class: "bill-box" });
    add.append(el("label", { for: "add-retailer" }, others.length > 1 ? "Third retailer" : "Add a retailer"));
    var select = el("select", { id: "add-retailer" });
    select.append(el("option", { value: "" }, others.length > 1 ? "Change the third retailer" : "Choose a third retailer"));
    (model.choices || []).forEach(function (choice) {
      var option = el("option", { value: choice.id }, choice.name + (choice.ours ? " (ours)" : ""));
      if (others[1] && others[1].retailerId === choice.id) option.selected = true;
      select.append(option);
    });
    select.addEventListener("change", function () {
      if (select.value && model.onAdd) model.onAdd(select.value);
    });
    add.append(select);
    if (others.length > 1) {
      var remove = el("button", { type: "button", class: "back" }, "Remove third retailer");
      remove.addEventListener("click", function () { if (model.onAdd) model.onAdd(""); });
      add.append(remove);
    }
    card.append(add);

    var table = el("table", { class: "rank" });
    var head = el("tr");
    head.append(el("th", {}, ""));
    sides.forEach(function (side) { head.append(el("th", {}, side.letter + " · " + side.name)); });
    others.forEach(function (side) { head.append(el("th", {}, side.letter + " vs A")); });
    table.append(el("thead"));
    table.tHead.append(head);
    var body = el("tbody");
    var tariff = D.tariffById(model.ctx.tariff);
    fields.forEach(function (field) {
      var values = sides.map(function (side) { return inclusive(side, field.key); });
      var tr = el("tr");
      tr.append(el("td", {}, field.label));
      values.forEach(function (value, index) {
        var klass = index === 0 ? "" : gapText(values[0], value, field.kind !== "higher").klass;
        tr.append(el("td", { class: klass }, showRate(field, value)));
      });
      others.forEach(function (side, index) {
        var diff = gapText(values[0], values[index + 1], field.kind !== "higher");
        tr.append(el("td", { class: diff.klass }, diff.text));
      });
      body.append(tr);
    });
    if (tariff) {
      tariff.usage.forEach(function (field) {
        var tr = el("tr");
        tr.append(el("td", {}, field.label));
        var value = C.num(model.usage[field.key]);
        var shown = value == null ? "—" : Math.round(value).toLocaleString("en-AU") + " " + (field.unit || "");
        var cell = el("td", { colspan: String(sides.length + others.length) }, shown + " — same usage on each plan");
        tr.append(cell);
        body.append(tr);
      });
    }
    if (costs[0] && costs[0].complete) {
      var year = el("tr");
      year.append(el("td", {}, "Estimated year"));
      costs.forEach(function (cost, index) {
        var klass = index > 0 && cost.complete && cost.normalised < costs[0].normalised ? "ink-better" : "";
        year.append(el("td", { class: klass }, cost.complete ? money(cost.normalised) : "—"));
      });
      others.forEach(function (side, index) {
        var cost = costs[index + 1];
        year.append(el("td", {}, cost && cost.complete ? money(costs[0].normalised - cost.normalised) + " difference" : "—"));
      });
      body.append(year);
    }
    table.append(body);
    card.append(table);

    var quotes = el("p", { class: "note" });
    sides.forEach(function (side) {
      if (!side.quoteUrl) return;
      var link = el("a", { href: side.quoteUrl, target: "_blank", rel: "noopener" }, side.name + " quote");
      quotes.append(link, document.createTextNode("  "));
    });
    if (quotes.childNodes.length) card.append(quotes);

    var talk = el("section", { class: "talk" });
    talk.append(el("h2", {}, "Say this"));
    var list = el("ol");
    talkingPoints(model, sides, costs, fields).forEach(function (point) {
      list.append(el("li", {}, point));
    });
    talk.append(list);
    card.append(talk);

    if (model.nmi) card.append(el("p", { class: "note" }, "NMI from the notes: " + model.nmi));
    if (model.notes) card.append(el("p", { class: "note" }, "Notes: " + model.notes));
    card.append(el("p", { class: "fine" }, D.DISCLAIMER));
    host.append(card);
    host.onclick = function (event) {
      if (event.target === host && model.onClose) model.onClose();
    };
  }

  function applyBill(model) {
    var amount = C.num(draftAmount);
    var tariff = D.tariffById(model.ctx.tariff);
    var customer = model.sides && model.sides[0];
    if (!tariff || !customer || amount == null || amount <= 0) {
      appliedBill = { error: "Enter the bill amount first." };
      render(document.getElementById("overlay"), model);
      return;
    }
    var days = draftPeriod === "year" ? 365 : draftPeriod === "quarter" ? 91.25 : 30.4167;
    var supply = inclusive(customer, "supply");
    var energyFields = tariff.fields.filter(function (field) {
      return (field.per === "kwh" || field.per === "mj") && field.kind !== "higher";
    });
    if (supply == null || !energyFields.length) {
      appliedBill = { error: "The current plan needs a daily charge and a usage rate before a bill can be turned into usage." };
      render(document.getElementById("overlay"), model);
      return;
    }
    var energyDollars = amount - supply / 100 * days;
    if (energyDollars <= 0) {
      appliedBill = { error: "That bill does not cover the daily charge for a " + draftPeriod + ". Check the amount or the period." };
      render(document.getElementById("overlay"), model);
      return;
    }
    var weights = energyFields.map(function (field) {
      return {
        field: field,
        rate: inclusive(customer, field.key),
        qty: C.num(model.usage[field.usageKey]) || D.defaultUsage(model.ctx, field.usageKey).value || 1
      };
    });
    if (weights.some(function (item) { return item.rate == null || item.rate <= 0; })) {
      appliedBill = { error: "Every usage rate on the current plan is needed before the bill can be split across the bands." };
      render(document.getElementById("overlay"), model);
      return;
    }
    var weightSum = weights.reduce(function (sum, item) { return sum + item.qty; }, 0) || 1;
    var blended = weights.reduce(function (sum, item) { return sum + item.rate * (item.qty / weightSum); }, 0);
    var annualQty = (energyDollars / (blended / 100)) * 365 / days;
    var nextUsage = {};
    weights.forEach(function (item) {
      nextUsage[item.field.usageKey] = String(Math.round(annualQty * item.qty / weightSum));
    });
    appliedBill = {
      annual: Math.round(annualQty),
      unit: energyFields[0].per === "mj" ? "MJ" : "kWh",
      period: draftPeriod,
      amount: amount,
      split: energyFields.length > 1
    };
    if (model.onUsage) model.onUsage(nextUsage);
  }

  function reset() { appliedBill = null; }

  root.QCCompare = { render: render, reset: reset };

  if (document.getElementById("app") && !document.getElementById("overlay")) {
    var payload = null;
    try { payload = JSON.parse(sessionStorage.getItem("qc-compare-v1") || "null"); } catch (err) { payload = null; }
    var standalone = document.getElementById("app");
    if (!payload) {
      standalone.append(el("h1", {}, "Compare"));
      standalone.append(el("p", {}, "Open Compare from the rank table. It stays on that page."));
    }
  }
})(window);
