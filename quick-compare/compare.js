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
    return C.annualCost(model.ctx.tariff, prepared, C.resolveUsage({ ctx: model.ctx, usage: model.usage, a: prepared, b: C.emptySide() }).resolved);
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
    if (costs[0] && costs[0].complete && others.length) {
      var best = null;
      others.forEach(function (side, index) {
        var cost = costs[index + 1];
        if (!cost || !cost.complete) return;
        var gap = costs[0].normalised - cost.normalised;
        if (!best || gap > best.gap) best = { side: side, cost: cost, gap: gap };
      });
      if (best) {
        var pct = costs[0].normalised ? Math.round(best.gap / costs[0].normalised * 100) : 0;
        var banner = el("div", { class: "banner" + (best.gap < 0 ? " is-worse" : "") });
        if (best.gap > 0) {
          banner.append(el("strong", {}, "Save " + money(best.gap) + " a year"));
          banner.append(el("p", {}, money(best.gap / 12) + " a month, " + pct + "% under " + (a.name || "the current plan") + ". " + best.side.name + " is " + money(best.cost.normalised) + " a year against " + money(costs[0].normalised) + "."));
        } else if (best.gap < 0) {
          banner.append(el("strong", {}, "The current plan is cheaper"));
          banner.append(el("p", {}, best.side.name + " costs " + money(-best.gap) + " more a year on this usage."));
        } else {
          banner.append(el("strong", {}, "Same annual cost"));
          banner.append(el("p", {}, "These plans come out together on this usage."));
        }
        card.append(banner);
      }
    }

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

    var pair = el("div", { class: "pair" + (sides.length > 2 ? " cols-3" : "") });
    sides.forEach(function (side) {
      var article = el("article");
      article.append(el("h2", { class: side.ours ? "ink-ours" : "" }, side.letter + " · " + (side.name || "Plan")));
      article.append(el("p", {}, side.planName || "Rates as entered"));
      if (side.ours) article.append(el("p", { class: "note" }, "One of our retailers."));
      if (side.contract) article.append(el("p", {}, side.contract));
      if (side.exitNote) article.append(el("p", {}, side.exitNote));
      if (side.quoteUrl) article.append(el("a", { href: side.quoteUrl, target: "_blank", rel: "noopener" }, "Open the retailer quote page"));
      pair.append(article);
    });
    card.append(pair);

    var tariff = D.tariffById(model.ctx.tariff);
    var table = el("table", { class: "rank" });
    var head = el("tr");
    head.append(el("th", {}, ""));
    sides.forEach(function (side) { head.append(el("th", {}, side.letter + " · " + side.name)); });
    others.forEach(function (side) { head.append(el("th", {}, side.letter + " vs A")); });
    table.append(el("thead"));
    table.tHead.append(head);
    var body = el("tbody");
    if (tariff) {
      tariff.fields.forEach(function (field) {
        if (field.kind === "text" || field.kind === "gst" || field.kind === "limit") return;
        var values = sides.map(function (side) { return inclusive(side, field.key); });
        if (values.every(function (value) { return value == null; })) return;
        var tr = el("tr");
        tr.append(el("td", {}, field.label));
        values.forEach(function (value, index) {
          var shown = field.per === "year" ? money(value || 0) : cents(value);
          var klass = index === 0 ? "" : gapText(values[0], value, field.kind !== "higher").klass;
          tr.append(el("td", { class: klass }, shown));
        });
        others.forEach(function (side, index) {
          var diff = gapText(values[0], values[index + 1], field.kind !== "higher");
          tr.append(el("td", { class: diff.klass }, diff.text));
        });
        body.append(tr);
      });
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
