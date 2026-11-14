"use strict";
/* One-to-one comparison opened from a rank row. */
(function () {
  var D = window.QCData;
  var C = window.QCCalc;
  var payload = null;
  try { payload = JSON.parse(sessionStorage.getItem("qc-compare-v1") || "null"); } catch (err) { payload = null; }
  var level = payload && payload.usageLevel ? payload.usageLevel : "medium";
  var usage = payload ? Object.assign({}, payload.usage || {}) : {};
  var billAmount = payload && payload.bill ? String(payload.bill.amount) : "";
  var billPeriod = payload && payload.bill ? payload.bill.period : "quarter";
  var appliedBill = null;

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

  function scaleTo(nextLevel) {
    if (!payload) return;
    level = nextLevel;
    var tariff = D.tariffById(payload.ctx.tariff);
    if (!tariff) return;
    var factor = nextLevel === "low" ? 0.55 : nextLevel === "high" ? 1.8 : 1;
    tariff.usage.forEach(function (field) {
      usage[field.key] = String(Math.round(D.defaultUsage(payload.ctx, field.key).value * factor));
    });
    appliedBill = null;
    render();
  }

  function applyBill() {
    if (!payload) return;
    var amount = C.num(billAmount);
    var a = payload.a;
    var tariff = D.tariffById(payload.ctx.tariff);
    if (!tariff || amount == null || amount <= 0) {
      appliedBill = { error: "Enter the bill amount first." };
      render();
      return;
    }
    var days = billPeriod === "year" ? 365 : billPeriod === "quarter" ? 91.25 : 30.4167;
    var supply = inclusive(a, "supply");
    var energyFields = tariff.fields.filter(function (field) {
      return (field.per === "kwh" || field.per === "mj") && field.kind !== "higher";
    });
    if (supply == null || !energyFields.length) {
      appliedBill = { error: "The current plan needs a daily charge and a usage rate before a bill can be turned into usage." };
      render();
      return;
    }
    var supplyDollars = supply / 100 * days;
    var energyDollars = amount - supplyDollars;
    if (energyDollars <= 0) {
      appliedBill = { error: "That bill does not cover the daily charge for a " + billPeriod + ". Check the amount or the period." };
      render();
      return;
    }
    var weights = energyFields.map(function (field) {
      var rate = inclusive(a, field.key);
      var qty = C.num(usage[field.usageKey]) || D.defaultUsage(payload.ctx, field.usageKey).value || 1;
      return { field: field, rate: rate, qty: qty };
    });
    if (weights.some(function (item) { return item.rate == null || item.rate <= 0; })) {
      appliedBill = { error: "Every usage rate on the current plan is needed before the bill can be split across the bands." };
      render();
      return;
    }
    var weightSum = weights.reduce(function (sum, item) { return sum + item.qty; }, 0) || 1;
    var blended = weights.reduce(function (sum, item) { return sum + item.rate * (item.qty / weightSum); }, 0);
    var periodQty = energyDollars / (blended / 100);
    var annualQty = periodQty * 365 / days;
    weights.forEach(function (item) {
      usage[item.field.usageKey] = String(Math.round(annualQty * item.qty / weightSum));
    });
    level = "manual";
    appliedBill = {
      annual: Math.round(annualQty),
      unit: energyFields[0].per === "mj" ? "MJ" : "kWh",
      period: billPeriod,
      amount: amount,
      split: energyFields.length > 1
    };
    render();
  }

  function sideCost(side) {
    var prepared = {
      rates: {},
      gstInclusive: true,
      retailerId: side.retailerId || "",
      planName: side.planName || ""
    };
    Object.keys(side.rates || {}).forEach(function (key) {
      var value = inclusive(side, key);
      if (value != null) prepared.rates[key] = value;
    });
    return C.annualCost(payload.ctx.tariff, prepared, C.resolveUsage({ ctx: payload.ctx, usage: usage, a: prepared, b: C.emptySide() }).resolved);
  }

  function render() {
    var host = document.getElementById("app");
    host.replaceChildren();
    if (!payload || !payload.a || !payload.b) {
      host.append(el("h1", {}, "Compare"));
      host.append(el("p", {}, "Choose Compare on a retailer in the rank table. This window then puts that retailer next to the customer."));
      return;
    }
    var a = payload.a;
    var b = payload.b;
    var costA = sideCost(a);
    var costB = sideCost(b);
    host.append(el("h1", {}, (a.name || "Current") + " compared with " + b.name));

    if (costA.complete && costB.complete) {
      var gap = costA.normalised - costB.normalised;
      var pct = costA.normalised ? Math.round(gap / costA.normalised * 100) : 0;
      var banner = el("div", { class: "banner" + (gap < 0 ? " is-worse" : "") });
      if (gap > 0) {
        banner.append(el("strong", {}, "Save " + money(gap) + " a year"));
        banner.append(el("p", {}, money(gap / 12) + " a month, " + pct + "% under " + (a.name || "the current plan") + ". " + b.name + " is " + money(costB.normalised) + " a year against " + money(costA.normalised) + "."));
      } else if (gap < 0) {
        banner.append(el("strong", {}, b.name + " costs " + money(-gap) + " more a year"));
        banner.append(el("p", {}, "On this usage the current plan is cheaper. " + b.name + " is " + money(costB.normalised) + " a year."));
      } else {
        banner.append(el("strong", {}, "Same annual cost"));
        banner.append(el("p", {}, "Both plans come out at " + money(costA.normalised) + " a year on this usage."));
      }
      host.append(banner);
    }

    var levels = el("div", { class: "levels" });
    [["low", "Low user"], ["medium", "Medium user"], ["high", "High user"]].forEach(function (pair) {
      var button = el("button", { type: "button", class: level === pair[0] ? "is-on" : "" }, pair[1]);
      button.addEventListener("click", function () { scaleTo(pair[0]); });
      levels.append(button);
    });
    host.append(levels);

    var billBox = el("div", { class: "bill-box" });
    billBox.append(el("label", { for: "bill-amount" }, "Bill amount"));
    var amount = el("input", { id: "bill-amount", inputmode: "decimal", value: billAmount });
    amount.addEventListener("input", function () { billAmount = amount.value; });
    var period = el("select", { id: "bill-period", "aria-label": "Bill period" });
    [["month", "per month"], ["quarter", "per quarter"], ["year", "per year"]].forEach(function (pair) {
      var option = el("option", { value: pair[0] }, pair[1]);
      if (pair[0] === billPeriod) option.selected = true;
      period.append(option);
    });
    period.addEventListener("change", function () { billPeriod = period.value; });
    var go = el("button", { type: "button", class: "view is-ours" }, "Work out usage");
    go.addEventListener("click", applyBill);
    billBox.append(amount, period, go);
    host.append(billBox);
    if (appliedBill && appliedBill.error) host.append(el("p", { class: "confirm" }, appliedBill.error));
    if (appliedBill && appliedBill.annual) {
      host.append(el("p", { class: "note" }, "A " + appliedBill.period + " bill of $" + appliedBill.amount + " works back to about " + appliedBill.annual.toLocaleString("en-AU") + " " + appliedBill.unit + " a year after the daily charge." + (appliedBill.split ? " The bands keep the same shares as the usage that was already selected." : "")));
    }

    var pair = el("div", { class: "pair" });
    [a, b].forEach(function (side, index) {
      var card = el("article");
      card.append(el("h2", { class: index === 1 && side.ours ? "ink-ours" : "" }, (index === 0 ? "A · " : "B · ") + (side.name || "Plan")));
      card.append(el("p", {}, side.planName || "Rates as entered"));
      if (index === 1 && side.ours) card.append(el("p", { class: "note" }, "One of our retailers."));
      if (index === 1 && side.contract) card.append(el("p", {}, side.contract));
      if (index === 1 && side.exitNote) card.append(el("p", {}, side.exitNote));
      if (index === 1 && side.quoteUrl) {
        var link = el("a", { href: side.quoteUrl, target: "_blank", rel: "noopener" }, "Open the retailer quote page");
        card.append(link);
      }
      pair.append(card);
    });
    host.append(pair);

    var tariff = D.tariffById(payload.ctx.tariff);
    var table = el("table", { class: "rank" });
    var head = el("tr");
    ["", a.name || "A", b.name || "B", "Difference"].forEach(function (label) { head.append(el("th", {}, label)); });
    table.append(el("thead"));
    table.tHead.append(head);
    var body = el("tbody");
    if (tariff) {
      tariff.fields.forEach(function (field) {
        if (field.kind === "text" || field.kind === "gst" || field.kind === "limit") return;
        var left = inclusive(a, field.key);
        var right = inclusive(b, field.key);
        if (left == null && right == null) return;
        var lowerIsBetter = field.kind !== "higher";
        var tr = el("tr");
        tr.append(el("td", {}, field.label));
        tr.append(el("td", {}, field.per === "year" ? money(left || 0) : cents(left)));
        var klass = "";
        var diff = "—";
        if (left != null && right != null && left !== 0) {
          var pct = Math.round((left - right) / Math.abs(left) * 100);
          var better = lowerIsBetter ? right < left : right > left;
          var worse = lowerIsBetter ? right > left : right < left;
          if (Math.abs((left - right) / left) >= 0.0008) {
            klass = better ? "ink-better" : worse ? "ink-worse" : "";
            diff = (pct > 0 ? pct + "% lower" : Math.abs(pct) + "% higher");
            if (!lowerIsBetter) diff = (right > left ? Math.round((right - left) / Math.abs(left) * 100) + "% higher credit" : Math.abs(pct) + "% lower credit");
          } else diff = "same";
        }
        tr.append(el("td", { class: klass }, field.per === "year" ? money(right || 0) : cents(right)));
        tr.append(el("td", { class: klass }, diff));
        body.append(tr);
      });
      tariff.usage.forEach(function (field) {
        var tr = el("tr");
        tr.append(el("td", {}, field.label));
        var value = C.num(usage[field.key]);
        var shown = value == null ? "—" : Math.round(value).toLocaleString("en-AU") + " " + (field.unit || "");
        tr.append(el("td", { colspan: "3" }, shown + " — same usage on both plans"));
        body.append(tr);
      });
    }
    if (costA.complete) {
      var year = el("tr");
      year.append(el("td", {}, "Estimated year"));
      year.append(el("td", {}, money(costA.normalised)));
      year.append(el("td", { class: costB.complete && costB.normalised < costA.normalised ? "ink-better" : "" }, costB.complete ? money(costB.normalised) : "—"));
      year.append(el("td", {}, costB.complete ? money(costA.normalised - costB.normalised) + " difference" : "—"));
      body.append(year);
    }
    table.append(body);
    host.append(table);

    if (payload.notes) host.append(el("p", { class: "note" }, "Notes: " + payload.notes));
    var facts = C.readNoteFacts(payload.notes || "", new Date());
    facts.uncertain.forEach(function (item) {
      host.append(el("p", { class: "confirm" }, item.question + " Confirm it on the customer panel if it should change the comparison."));
    });
    host.append(el("p", { class: "fine" }, D.DISCLAIMER));
  }

  render();
})();
