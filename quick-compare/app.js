"use strict";
/* Sales-floor page. Retailer A stays put when the tariff, usage, or Retailer B changes. */
(function () {
  var D = window.QCData;
  var C = window.QCCalc;
  var state = loadState() || C.createState();
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var usageSig = "";
  var rateSig = "";
  var planSig = "";
  var tariffSig = "";
  var netSig = "";
  var panelOpen = !!(state.c && state.c.name);
  var barSeen = false;
  var comboA;
  var comboB;
  var comboC;

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

  function loadState() {
    try {
      var raw = sessionStorage.getItem("qc-state-v1");
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.a || !parsed.b || !parsed.ctx) return null;
      parsed.usage = parsed.usage || {};
      parsed.messages = parsed.messages || { bill: "", context: "" };
      parsed.a.rates = parsed.a.rates || {};
      parsed.a.windows = parsed.a.windows || {};
      parsed.b.rates = parsed.b.rates || {};
      parsed.b.windows = parsed.b.windows || {};
      if (parsed.c) {
        parsed.c.rates = parsed.c.rates || {};
        parsed.c.windows = parsed.c.windows || {};
      }
      return parsed;
    } catch (err) {
      return null;
    }
  }

  function save() {
    try { sessionStorage.setItem("qc-state-v1", JSON.stringify(state)); } catch (err) { /* private mode */ }
  }

  function commit(next) {
    state = next;
    save();
    paint();
  }

  function retailerLine(retailer) {
    if (retailer.note) return retailer.note;
    var parts = [];
    if (retailer.electricity && retailer.electricity.length) parts.push("Electricity " + retailer.electricity.join(", "));
    if (retailer.gas && retailer.gas.length) parts.push("Gas " + retailer.gas.join(", "));
    if (retailer.publishedDirect) parts.push("Published tariff");
    return parts.join(" · ");
  }

  function mountCombo(host, opts) {
    host.replaceChildren();
    var listId = opts.listId;
    var input = el("input", {
      type: "text",
      class: "combo-input",
      id: opts.inputId,
      role: "combobox",
      "aria-expanded": "false",
      "aria-autocomplete": "list",
      "aria-controls": listId,
      autocomplete: "off",
      placeholder: opts.placeholder
    });
    if (opts.labelId) input.setAttribute("aria-labelledby", opts.labelId);
    else input.setAttribute("aria-label", opts.placeholder);
    var button = el("button", { type: "button", class: "combo-open", "aria-label": opts.openLabel }, "▾");
    var list = el("ul", { class: "combo-list", id: listId, role: "listbox", hidden: "true" });
    var wrap = el("div", { class: "combo" });
    wrap.append(input, button, list);
    host.append(wrap);
    var items = [];
    var active = -1;
    var moved = false;

    function close() {
      list.hidden = true;
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
    }
    function open() {
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
    }
    function paintActive() {
      items.forEach(function (item, index) {
        var on = index === active;
        item.node.classList.toggle("is-active", on);
        if (on) item.node.setAttribute("aria-selected", "true");
        else item.node.removeAttribute("aria-selected");
      });
      if (active < 0 || !items[active]) {
        input.removeAttribute("aria-activedescendant");
        return;
      }
      input.setAttribute("aria-activedescendant", items[active].node.id);
      var node = items[active].node;
      var top = node.offsetTop;
      var bottom = top + node.offsetHeight;
      if (top < list.scrollTop) list.scrollTop = top;
      else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
    }
    function render(query) {
      moved = false;
      var matches = D.searchRetailers(query).slice(0, query ? 12 : 40);
      list.replaceChildren();
      items = [];
      active = -1;
      matches.forEach(function (retailer, index) {
        var option = el("li", { class: "combo-option", role: "option", id: listId + "-" + index });
        option.append(el("strong", {}, retailer.name));
        option.append(el("span", {}, retailerLine(retailer)));
        var sel = { id: retailer.id, name: retailer.name, custom: false };
        option.addEventListener("mousedown", function (event) {
          event.preventDefault();
          pick(sel);
        });
        list.append(option);
        items.push({ node: option, sel: sel });
      });
      var typed = String(query || "").trim();
      var exact = matches.some(function (retailer) { return retailer.name.toLowerCase() === typed.toLowerCase(); });
      if (typed && !exact) {
        var custom = el("li", { class: "combo-option custom", role: "option", id: listId + "-custom" });
        custom.append(el("strong", {}, "Use “" + typed + "”"));
        custom.append(el("span", {}, "Not in the list. Enter the rates by hand."));
        var customSel = { id: "", name: typed, custom: true };
        custom.addEventListener("mousedown", function (event) {
          event.preventDefault();
          pick(customSel);
        });
        list.append(custom);
        items.push({ node: custom, sel: customSel });
      }
      if (items.length) active = 0;
      paintActive();
      open();
    }
    function pick(sel) {
      input.value = sel.name;
      close();
      opts.onPick(sel);
    }
    input.addEventListener("input", function () { render(input.value); });
    input.addEventListener("focus", function () { render(input.value); });
    input.addEventListener("keydown", function (event) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (list.hidden) render(input.value);
        if (!items.length) return;
        moved = true;
        active = Math.min(items.length - 1, active + 1);
        paintActive();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        if (!items.length) return;
        moved = true;
        active = Math.max(0, active - 1);
        paintActive();
      } else if (event.key === "Enter") {
        if (list.hidden || active < 0 || !items[active]) return;
        if (!String(input.value || "").trim() && !moved) return;
        event.preventDefault();
        pick(items[active].sel);
      } else if (event.key === "Escape") {
        close();
      }
    });
    button.addEventListener("click", function () {
      if (list.hidden) {
        input.focus();
        render(input.value);
      } else {
        close();
      }
    });
    input.addEventListener("blur", function () {
      setTimeout(function () {
        if (!wrap.contains(document.activeElement)) close();
      }, 120);
    });
    document.addEventListener("pointerdown", function (event) {
      if (!wrap.contains(event.target)) close();
    });
    return {
      input: input,
      setValue: function (name) {
        if (document.activeElement !== input) input.value = name || "";
      }
    };
  }

  function pickCurrent(sel) {
    if (!sel || !sel.name) return;
    if (sel.custom && state.a.custom && state.a.name && state.a.name.toLowerCase() === sel.name.toLowerCase()) return;
    if (sel.custom && state.a.custom && state.a.name) {
      commit(Object.assign({}, state, { a: Object.assign({}, state.a, { name: sel.name }) }));
      return;
    }
    commit(C.selectCurrentRetailer(state, sel));
  }

  function pickAlternative(sel) {
    if (!sel || !sel.name) return;
    if (sel.custom && state.b.custom && state.b.name && state.b.name.toLowerCase() === sel.name.toLowerCase()) return;
    if (sel.custom && state.b.custom && state.b.name) {
      commit(Object.assign({}, state, { b: Object.assign({}, state.b, { name: sel.name }) }));
      return;
    }
    commit(C.selectAlternative(state, sel));
  }

  function pickExtra(sel) {
    if (!sel || !sel.name) return;
    panelOpen = true;
    if (sel.custom && state.c && state.c.custom && state.c.name && state.c.name.toLowerCase() === sel.name.toLowerCase()) return;
    if (sel.custom && state.c && state.c.custom && state.c.name) {
      commit(Object.assign({}, state, { c: Object.assign({}, state.c, { name: sel.name }) }));
      return;
    }
    commit(C.selectExtra(state, sel));
  }

  function fieldByKey(key) {
    var tariff = D.tariffById(state.ctx.tariff);
    if (!tariff) return null;
    for (var i = 0; i < tariff.fields.length; i++) {
      if (tariff.fields[i].key === key) return tariff.fields[i];
    }
    return null;
  }

  function buildContext() {
    var mount = document.getElementById("context-mount");
    var postcode = el("input", { id: "postcode", type: "text", inputmode: "numeric", maxlength: "4", autocomplete: "postal-code", placeholder: "4 digits" });
    var region = el("select", { id: "region" });
    region.append(el("option", { value: "" }, "Choose a state"));
    Object.keys(D.REGIONS).forEach(function (id) {
      region.append(el("option", { value: id }, D.REGIONS[id].name));
    });
    var network = el("select", { id: "network" });
    var customerRes = el("button", { type: "button", id: "customer-res" }, "Residential");
    var customerBiz = el("button", { type: "button", id: "customer-biz" }, "Business");
    var fuelElec = el("button", { type: "button", id: "fuel-elec" }, "Electricity");
    var fuelGas = el("button", { type: "button", id: "fuel-gas" }, "Gas");
    var tariff = el("select", { id: "tariff" });

    function labelled(id, text, control, wide) {
      var wrap = el("div", { class: wide ? "field wide" : "field" });
      wrap.append(el("label", { for: id }, text));
      wrap.append(control);
      return wrap;
    }
    var grid = el("div", { class: "field-grid" });
    grid.append(labelled("postcode", "Postcode", postcode));
    grid.append(labelled("region", "State", region));
    var networkField = labelled("network", "Reference network", network);
    networkField.id = "network-field";
    grid.append(networkField);
    var customer = el("div", { class: "field" });
    customer.append(el("span", { id: "customer-label" }, "Residential or business"));
    var customerToggles = el("div", { class: "toggles", role: "group", "aria-labelledby": "customer-label" });
    customerToggles.append(customerRes, customerBiz);
    customer.append(customerToggles);
    var fuel = el("div", { class: "field" });
    fuel.append(el("span", { id: "fuel-label" }, "Electricity or gas"));
    var fuelToggles = el("div", { class: "toggles", role: "group", "aria-labelledby": "fuel-label" });
    fuelToggles.append(fuelElec, fuelGas);
    fuel.append(fuelToggles);
    grid.append(customer, fuel);
    grid.append(labelled("tariff", "Tariff configuration", tariff, true));
    mount.append(grid);

    postcode.addEventListener("input", function () {
      var cleaned = postcode.value.replace(/\D/g, "").slice(0, 4);
      if (cleaned !== postcode.value) postcode.value = cleaned;
      commit(C.setContext(state, { postcode: cleaned }));
    });
    region.addEventListener("change", function () {
      commit(C.setContext(state, { region: region.value }));
    });
    network.addEventListener("change", function () {
      commit(C.setContext(state, { network: network.value }));
    });
    customerRes.addEventListener("click", function () { commit(C.setContext(state, { customer: "residential" })); });
    customerBiz.addEventListener("click", function () { commit(C.setContext(state, { customer: "business" })); });
    fuelElec.addEventListener("click", function () { commit(C.setContext(state, { fuel: "electricity" })); });
    fuelGas.addEventListener("click", function () { commit(C.setContext(state, { fuel: "gas" })); });
    tariff.addEventListener("change", function () {
      commit(C.setContext(state, { tariff: tariff.value }));
    });
  }

  function syncContext() {
    var postcode = document.getElementById("postcode");
    var region = document.getElementById("region");
    var network = document.getElementById("network");
    var tariff = document.getElementById("tariff");
    if (document.activeElement !== postcode && postcode.value !== (state.ctx.postcode || "")) postcode.value = state.ctx.postcode || "";
    if (document.activeElement !== region) region.value = state.ctx.region || "";

    var nets = D.networksFor(state.ctx.region);
    if (netSig !== state.ctx.region) {
      netSig = state.ctx.region;
      network.replaceChildren();
      network.append(el("option", { value: "" }, state.ctx.region ? "Choose a network" : "Choose a state first"));
      nets.forEach(function (item) { network.append(el("option", { value: item.id }, item.name)); });
    }
    if (document.activeElement !== network) network.value = state.ctx.network || "";
    document.getElementById("network-field").hidden = state.ctx.fuel !== "electricity";

    var residential = state.ctx.customer !== "business";
    document.getElementById("customer-res").classList.toggle("is-on", residential);
    document.getElementById("customer-biz").classList.toggle("is-on", !residential);
    document.getElementById("customer-res").setAttribute("aria-pressed", residential ? "true" : "false");
    document.getElementById("customer-biz").setAttribute("aria-pressed", residential ? "false" : "true");
    var electricity = state.ctx.fuel !== "gas";
    document.getElementById("fuel-elec").classList.toggle("is-on", electricity);
    document.getElementById("fuel-gas").classList.toggle("is-on", !electricity);
    document.getElementById("fuel-elec").setAttribute("aria-pressed", electricity ? "true" : "false");
    document.getElementById("fuel-gas").setAttribute("aria-pressed", electricity ? "false" : "true");

    var tariffs = D.tariffsFor(state.ctx.customer, state.ctx.fuel);
    var sig = tariffs.map(function (item) { return item.id; }).join(",");
    if (sig !== tariffSig) {
      tariffSig = sig;
      tariff.replaceChildren();
      tariffs.forEach(function (item) { tariff.append(el("option", { value: item.id }, item.label)); });
    }
    if (document.activeElement !== tariff) tariff.value = state.ctx.tariff;

    var hint = state.ctx.hint || "Choose the state on the bill. Sample rates differ by state and by network.";
    if (state.ctx.fuel === "gas") hint += " Gas sample rates follow the state. There is no electricity network on a gas comparison.";
    document.getElementById("context-hint").textContent = hint;
    document.getElementById("context-message").textContent = state.messages.context || "";
  }

  function onUsage(key, raw) {
    state = C.setUsage(state, key, raw);
    save();
    paintOutputs();
  }

  function onRate(which, key, raw) {
    state = C.enterRate(state, which, key, raw);
    save();
    paintOutputs();
    syncPlan();
    syncReload();
  }

  function onWindow(which, key, raw) {
    state = C.setWindow(state, which, key, raw);
    save();
    paintOutputs();
  }

  function onText(which, key, raw) {
    state = C.setText(state, which, key, raw);
    save();
    paintOutputs();
  }

  function onGst(which, inclusive) {
    state = C.setGst(state, which, inclusive);
    save();
    paintOutputs();
  }

  function buildUsage() {
    var tariff = D.tariffById(state.ctx.tariff);
    var mount = document.getElementById("usage-mount");
    mount.replaceChildren();
    if (!tariff) return;
    tariff.usage.forEach(function (field) {
      var wrap = el("div", { class: "field" });
      var id = "usage-" + field.key;
      wrap.append(el("label", { for: id }, field.label + " (" + field.unit + ")"));
      var input = el("input", {
        id: id,
        type: "text",
        inputmode: "decimal",
        autocomplete: "off",
        "data-key": field.key,
        "data-unit": field.unit
      });
      input.addEventListener("input", function () { onUsage(field.key, input.value); });
      wrap.append(input);
      mount.append(wrap);
    });
  }

  function fillUsage() {
    document.querySelectorAll("#usage-mount input").forEach(function (input) {
      var fallback = D.defaultUsage(state.ctx, input.getAttribute("data-key"));
      var unit = input.getAttribute("data-unit") || "";
      input.placeholder = "Blank uses " + Number(fallback.value).toLocaleString("en-AU") + (unit ? " " + unit : "");
      if (document.activeElement === input) return;
      var raw = state.usage[input.getAttribute("data-key")];
      var next = raw == null || raw === "" ? "" : String(raw);
      if (input.value !== next) input.value = next;
    });
  }

  function sideOf(which) {
    return state[which] || C.emptySide();
  }

  function buildRates(which, mount) {
    var tariff = D.tariffById(state.ctx.tariff);
    mount.replaceChildren();
    if (!tariff) return;
    var side = sideOf(which);
    tariff.fields.forEach(function (field) {
      var wrap = el("div", { class: field.kind === "text" ? "field wide" : "field" });
      if (field.kind === "gst") {
        var gstId = which + "-gst";
        wrap.append(el("label", { for: gstId }, "GST treatment"));
        var gst = el("select", { id: gstId, "data-side": which, "data-kind": "gst" });
        gst.append(el("option", { value: "inclusive" }, "GST inclusive"));
        gst.append(el("option", { value: "exclusive" }, "GST exclusive"));
        gst.value = side.gstInclusive === false ? "exclusive" : "inclusive";
        gst.addEventListener("change", function () { onGst(which, gst.value === "inclusive"); });
        wrap.append(gst);
        mount.append(wrap);
        return;
      }
      if (field.kind === "text") {
        var textId = which + "-text-" + field.key;
        wrap.append(el("label", { for: textId }, field.label));
        var text = el("input", { id: textId, type: "text", autocomplete: "off", "data-side": which, "data-kind": "text", "data-key": field.key });
        text.value = side[field.key] || "";
        text.addEventListener("input", function () { onText(which, field.key, text.value); });
        wrap.append(text);
        mount.append(wrap);
        return;
      }
      var id = which + "-rate-" + field.key;
      var unit = field.unit ? " (" + field.unit + ")" : "";
      wrap.append(el("label", { for: id }, field.label + unit));
      var input = el("input", {
        id: id,
        type: "text",
        inputmode: "decimal",
        autocomplete: "off",
        "data-side": which,
        "data-kind": "rate",
        "data-key": field.key
      });
      var raw = side.rates && side.rates[field.key];
      input.value = raw == null || raw === "" ? "" : String(raw);
      input.addEventListener("input", function () { onRate(which, field.key, input.value); });
      wrap.append(input);
      if (field.windowKey) {
        var winId = which + "-win-" + field.windowKey;
        var winLabel = el("label", { for: winId }, field.label + " time window");
        winLabel.className = "hint";
        wrap.append(winLabel);
        var win = el("input", { id: winId, type: "text", autocomplete: "off", "data-side": which, "data-kind": "window", "data-key": field.windowKey });
        win.value = (side.windows && side.windows[field.windowKey]) || "";
        win.addEventListener("input", function () { onWindow(which, field.windowKey, win.value); });
        wrap.append(win);
      }
      mount.append(wrap);
    });
  }

  function fillRates(which) {
    document.querySelectorAll("[data-side='" + which + "']").forEach(function (input) {
      if (document.activeElement === input) return;
      var side = sideOf(which);
      var kind = input.getAttribute("data-kind");
      var key = input.getAttribute("data-key");
      var next = "";
      if (kind === "gst") next = side.gstInclusive === false ? "exclusive" : "inclusive";
      else if (kind === "text") next = side[key] || "";
      else if (kind === "window") next = (side.windows && side.windows[key]) || "";
      else {
        var raw = side.rates && side.rates[key];
        next = raw == null || raw === "" ? "" : String(raw);
      }
      if (input.value !== next) input.value = next;
    });
  }

  function syncRates() {
    var tariff = D.tariffById(state.ctx.tariff);
    var sig = tariff ? tariff.id : "";
    if (sig !== rateSig) {
      rateSig = sig;
      buildRates("a", document.getElementById("rate-mount"));
      buildRates("b", document.getElementById("b-rate-mount"));
      buildRates("c", document.getElementById("c-rate-mount"));
    } else {
      fillRates("a");
      fillRates("b");
      fillRates("c");
    }
    if (sig !== usageSig) {
      usageSig = sig;
      buildUsage();
    }
    fillUsage();
    document.getElementById("b-rate-mount").hidden = !state.b.name;
    var cMount = document.getElementById("c-rate-mount");
    if (cMount) cMount.hidden = !(state.c && state.c.name);
  }

  function syncPlan() {
    var select = document.getElementById("plan-select");
    var retailer = D.retailerById(state.a.retailerId);
    var choices = retailer ? D.planChoices(retailer, state.ctx.tariff) : [];
    if (state.a.planChoiceId && !choices.some(function (item) { return item.id === state.a.planChoiceId; })) {
      choices = choices.concat([{ id: state.a.planChoiceId, label: state.a.planLabel || "Identified plan" }]);
    }
    var blank = retailer
      ? "Plan not identified — enter the rates"
      : (state.a.name ? "Not in the list — enter the rates from the bill" : "Choose the current retailer first");
    var sig = (state.a.retailerId || "") + "|" + (state.a.name || "") + "|" + state.ctx.tariff + "|" + choices.map(function (item) { return item.id; }).join(",");
    if (sig !== planSig) {
      planSig = sig;
      select.replaceChildren();
      select.append(el("option", { value: "" }, blank));
      choices.forEach(function (item) {
        select.append(el("option", { value: item.id }, item.label + " — sample reference"));
      });
    }
    if (document.activeElement !== select) select.value = state.a.planChoiceId || "";
    select.disabled = !retailer;
  }

  function syncKept() {
    var host = document.getElementById("retailer-a-selected");
    host.replaceChildren();
    if (!state.a.name) return;
    var box = el("div", { class: "kept" });
    var text = el("div");
    text.append(el("p", { class: "eyebrow" }, "KEPT FOR THIS COMPARISON"));
    text.append(el("strong", {}, state.a.name));
    if (state.a.planLabel) text.append(el("span", { class: "planline" }, state.a.planLabel));
    box.append(text);
    host.append(box);
    comboA.setValue(state.a.name);

    var bHost = document.getElementById("retailer-b-selected");
    bHost.replaceChildren();
    if (state.b.name) {
      var bBox = el("div", { class: "kept" });
      var bText = el("div");
      bText.append(el("p", { class: "eyebrow" }, "RETAILER B"));
      bText.append(el("strong", {}, state.b.name));
      if (state.b.planLabel) bText.append(el("span", { class: "planline" }, state.b.planLabel));
      bBox.append(bText);
      bHost.append(bBox);
    }
    comboB.setValue(state.b.name || "");

    var cHost = document.getElementById("retailer-c-selected");
    if (cHost) {
      cHost.replaceChildren();
      if (state.c && state.c.name) {
        var cBox = el("div", { class: "kept" });
        var cText = el("div");
        cText.append(el("p", { class: "eyebrow" }, "EXTRA RETAILER"));
        cText.append(el("strong", {}, state.c.name));
        cBox.append(cText);
        cHost.append(cBox);
        comboC.setValue(state.c.name);
      }
    }
  }

  function reloadButton(which, label, warning) {
    var button = el("button", { type: "button", class: "ghost" }, label);
    button.addEventListener("click", function () {
      var next = C.reloadSample(state, which);
      if (next === state) {
        var note = D.whyNoPlan(state[which].retailerId, state.ctx);
        commit(Object.assign({}, state, { messages: Object.assign({}, state.messages, { context: note }) }));
        return;
      }
      commit(next);
    });
    var note = el("p", { class: "source-note" }, warning);
    var row = el("div");
    row.append(button, note);
    return row;
  }

  function syncReload() {
    var aRow = document.getElementById("reload-a-row");
    aRow.replaceChildren();
    if (state.a.retailerId) {
      var warning = "Sample reference only. It replaces the rates on Retailer A. It is not the customer's plan unless that plan was identified.";
      if (state.a.source === "bill" || state.a.source === "plan-doc") warning = "This replaces the rates read from the document.";
      aRow.append(reloadButton("a", "Load sample reference for this tariff", warning));
    } else if (state.a.name) {
      aRow.append(el("span", { class: "source-note" }, "This retailer is not in the reference list. Enter the rates from the bill."));
    }
    var bRow = document.getElementById("reload-b-row");
    bRow.replaceChildren();
    if (state.b.retailerId && state.b.source !== "live" && state.b.source !== "abc") {
      bRow.append(reloadButton("b", "Reload sample reference for Retailer B", "Replaces the rates typed on Retailer B. Retailer A is left as it is."));
    }
    if (!state.b.name) {
      bRow.append(el("span", { class: "source-note" }, "Choose Retailer B. Sample reference rates load for the tariff above. Retailer A stays."));
    }
  }

  function syncExtra() {
    var show = panelOpen || !!(state.c && state.c.name);
    document.getElementById("c-panel").hidden = !show;
    document.getElementById("add-c").hidden = show;
  }

  function badge(source, which) {
    if (!source) return el("span", { class: "badge manual" }, which === "a" ? "PLAN NOT IDENTIFIED" : "NO SAMPLE LOADED");
    var map = {
      bill: ["ACTUAL BILL", "bill"],
      "plan-doc": ["PLAN DOCUMENTATION", "plan-doc"],
      database: ["PRICING DATABASE", "database"],
      manual: ["MANUAL ENTRY", "manual"],
      live: ["SAMPLE REFERENCE", "live"],
      abc: ["ABC DATABASE", "abc"]
    };
    var item = map[source] || ["PLAN NOT IDENTIFIED", "manual"];
    return el("span", { class: "badge " + item[1] }, item[0]);
  }

  function quoteLink(side, customer) {
    var retailer = D.retailerById(side.retailerId);
    var url = retailer ? D.quoteUrlFor(retailer, customer) : (side.quoteUrl || "");
    if (!url) return null;
    return el("a", {
      class: "quote",
      href: url,
      target: "_blank",
      rel: "noopener noreferrer",
      "aria-label": "Open " + side.name + " quote page"
    }, "Open quote page");
  }

  function rateText(value, unit) {
    if (value == null || !Number.isFinite(value)) return "—";
    if (unit === "$/year") return C.formatMoney(value) + "/year";
    if (unit === "$/kW/month") return C.formatMoney(value) + "/kW/month";
    return C.formatRate(value) + " " + unit;
  }

  function column(which, title, compared, cost, rows) {
    var side = state[which] || C.emptySide();
    var col = el("section", { class: "col col-" + which, "aria-label": title });
    col.append(el("h2", {}, title));
    if (!side.name) {
      col.append(el("p", { class: "empty-side" }, which === "a"
        ? "Choose the current retailer at the top. The rates stay on this side when you change the alternative."
        : "Choose an alternative retailer. Changing this side does not clear Retailer A."));
      return col;
    }
    col.append(el("p", { class: "retailer-name" }, side.name));
    col.append(el("p", { class: "plan-name" }, side.planLabel || "Plan not identified"));
    col.append(badge(side.source, which));
    col.append(el("p", { class: "verified" }, C.lastVerified(side)));
    if (side.sourceNote) col.append(el("p", { class: "basis" }, side.sourceNote));
    var ladder = el("ol", { class: "ladder" });
    C.sourceLadder(side, which === "a" ? "a" : "b").forEach(function (row) {
      var item = el("li", { class: row.active ? "active" : "" });
      item.append(el("span", { class: "n" }, row.n));
      item.append(el("span", {}, row.label));
      item.append(el("span", { class: "when" }, row.status));
      ladder.append(item);
    });
    col.append(ladder);
    rows.forEach(function (row) {
      var mine = which === "a" ? "a" : "b";
      var cell = el("div", { class: "cell" + (row.winner === mine ? " better" : "") });
      cell.append(el("div", { class: "cell-label" }, row.label));
      var windowText = mine === "a" ? row.windowA : row.windowB;
      if (windowText) cell.append(el("div", { class: "cell-window" }, windowText));
      if (row.kind === "text" || row.kind === "gst") {
        cell.append(el("div", { class: "figure" }, mine === "a" ? row.aText : row.bText));
        if (row.gap) cell.append(el("div", { class: "warn" }, row.gap));
      } else if (row.missing && row.a == null && row.b == null) {
        var field = fieldByKey(row.key);
        var blankYear = row.unit === "$/year";
        var unused = field && field.optional && field.per !== "year";
        cell.append(el("div", { class: "figure" }, "—"));
        cell.append(el("div", { class: "missing" }, blankYear
          ? "Left blank. Included as $0 in the annual cost, not dropped."
          : unused
            ? "Not on this plan."
            : "Missing. Not treated as zero."));
      } else {
        var value = mine === "a" ? row.a : row.b;
        cell.append(el("div", { class: "figure" }, rateText(value, row.unit)));
        if (row.winner === mine) {
          cell.append(el("div", { class: "same" }, row.kind === "higher" ? "Better feed-in" : "Cheaper"));
        } else if (row.worse === mine && row.gap) {
          cell.append(el("div", { class: "gap" }, row.gap));
        } else if (row.neutral && row.gap) {
          cell.append(el("div", { class: "same" }, row.gap));
        } else if (row.missing) {
          cell.append(el("div", { class: "missing" }, value == null ? "Missing. Not treated as zero." : "The other side is missing."));
        }
      }
      col.append(cell);
    });
    var annual = el("div", { class: "annual" + (compared && compared.annualWinner === (which === "a" ? "a" : "b") ? " better" : "") });
    annual.append(el("div", { class: "cell-label" }, "Estimated annual cost"));
    if (!cost || !cost.complete) {
      annual.append(el("div", { class: "figure" }, "Not calculated"));
      annual.append(el("p", { class: "missing" }, cost && cost.missing.length ? "Missing " + cost.missing.join(", ") + ". Supply and the other parts of this tariff have to be in the figure." : "Enter the rates for this tariff."));
    } else {
      annual.append(el("div", { class: "figure" }, C.formatMoney(cost.normalised)));
      if (!cost.gstInclusive) annual.append(el("p", { class: "basis" }, "Entered exclusive of GST. Compared at the GST-inclusive amount."));
      var list = el("ul", { class: "breakdown" });
      cost.lines.forEach(function (line) {
        var item = el("li");
        item.append(el("span", {}, line.label));
        item.append(el("span", {}, C.formatMoney(line.dollars)));
        list.append(item);
        if (line.detail) {
          var detail = el("li", { class: "detail" });
          detail.append(el("span", {}, line.detail));
          list.append(detail);
        }
      });
      annual.append(list);
    }
    col.append(annual);
    var link = quoteLink(side, state.ctx.customer);
    if (link) col.append(link);
    else col.append(el("p", { class: "basis" }, "No public quote page is on file for this name."));
    if (which !== "a") {
      var comp = D.comparatorFor(state.ctx.region);
      if (comp) col.append(el("a", { class: "quote secondary", href: comp.url, target: "_blank", rel: "noopener noreferrer" }, "Check " + comp.name));
    }
    return col;
  }

  function paintComparison() {
    var usage = C.resolveUsage(state);
    var compared = C.compareSides(state, usage.resolved);
    var mount = document.getElementById("comparison-mount");
    mount.replaceChildren();
    var hasC = !!(state.c && state.c.name);
    var cols = el("div", { class: hasC ? "cols cols-3" : "cols" });
    cols.append(column("a", "RETAILER A — CURRENT PROVIDER", compared, compared.aCost, compared.rows));
    cols.append(column("b", "RETAILER B — ALTERNATIVE PROVIDER", compared, compared.bCost, compared.rows));
    if (hasC) {
      var comparedC = C.compareSides({ a: state.a, b: state.c, ctx: state.ctx }, usage.resolved);
      cols.append(column("c", "RETAILER C — EXTRA", comparedC, comparedC.bCost, comparedC.rows));
    }
    mount.append(cols);
    mount.append(el("p", { class: "plain", id: "plain-compare" }, C.plainCompare(state, compared, usage)));
    paintSavings(compared, usage);
  }

  function moneyLine(label, value, big, down) {
    var p = el("p", { class: big ? (down ? "big down" : "big") : "" });
    p.append(document.createTextNode(label + ": "));
    p.append(el("span", {}, value));
    return p;
  }

  function savingFigures(compared) {
    if (!compared.aCost.complete || !compared.bCost.complete) return null;
    var annual = Math.round((compared.aCost.normalised - compared.bCost.normalised) * 100) / 100;
    return {
      annual: annual,
      a: C.formatMoney(compared.aCost.normalised),
      b: C.formatMoney(compared.bCost.normalised),
      year: C.formatMoney(annual),
      month: C.formatMoney(annual / 12),
      quarter: C.formatMoney(annual / 4)
    };
  }

  function paintSavings(compared, usage) {
    var host = document.getElementById("savings-mount");
    host.replaceChildren();
    var box = el("div", { class: "savings", id: "savings-block" });
    var figures = savingFigures(compared);
    if (!figures) {
      box.append(moneyLine("CURRENT RETAILER ESTIMATED ANNUAL COST", compared.aCost.complete ? C.formatMoney(compared.aCost.normalised) : "Not calculated"));
      box.append(moneyLine("ALTERNATIVE RETAILER ESTIMATED ANNUAL COST", compared.bCost.complete ? C.formatMoney(compared.bCost.normalised) : "Not calculated"));
      box.append(moneyLine("ESTIMATED ANNUAL SAVING", "Not calculated", true));
      box.append(moneyLine("ESTIMATED MONTHLY SAVING", "Not calculated"));
      box.append(moneyLine("ESTIMATED QUARTERLY SAVING", "Not calculated"));
      var why = [];
      if (!state.a.name || !state.b.name) why.push("Choose Retailer A and Retailer B.");
      if (state.a.name && !compared.aCost.complete) why.push(state.a.name + " is missing " + compared.aCost.missing.join(", ") + ".");
      if (state.b.name && !compared.bCost.complete) why.push(state.b.name + " is missing " + compared.bCost.missing.join(", ") + ".");
      box.append(el("p", { class: "fine" }, why.join(" ") + " The saving is not worked out from the usage rate alone. Daily supply and the other parts of this tariff have to be in it."));
    } else {
      var down = figures.annual < 0;
      box.append(moneyLine("CURRENT RETAILER ESTIMATED ANNUAL COST", figures.a));
      box.append(moneyLine("ALTERNATIVE RETAILER ESTIMATED ANNUAL COST", figures.b));
      box.append(moneyLine("ESTIMATED ANNUAL SAVING", figures.year, true, down));
      box.append(moneyLine("ESTIMATED MONTHLY SAVING", figures.month + " (" + figures.year + " / 12)"));
      box.append(moneyLine("ESTIMATED QUARTERLY SAVING", figures.quarter + " (" + figures.year + " / 4)"));
      box.append(el("p", { class: "fine" }, "Daily supply and the other parts of this tariff are included. A positive saving means Retailer B costs less than Retailer A on the usage used here."));
    }
    var assumptions = (usage.assumptions || []).slice();
    (compared.aCost.rateAssumptions || []).forEach(function (item) { assumptions.push("Retailer A: " + item); });
    (compared.bCost.rateAssumptions || []).forEach(function (item) { assumptions.push("Retailer B: " + item); });
    if (usage.incomplete || assumptions.length) {
      box.append(el("p", { class: "estimate-flag" }, "ESTIMATE. Usage or a charge was incomplete, so the figure uses the assumptions below."));
      var list = el("ul", { class: "assumptions" });
      assumptions.forEach(function (item) { list.append(el("li", {}, item)); });
      box.append(list);
    }
    if (state.c && state.c.name) {
      box.append(el("p", { class: "fine" }, "The saving is Retailer A against Retailer B. Retailer C is the extra column only."));
    }
    host.append(box);
    paintBar(figures);
  }

  function paintBar(figures) {
    var bar = document.getElementById("savings-bar");
    var wrap = bar.querySelector(".wrap");
    if (!wrap) {
      wrap = el("div", { class: "wrap" });
      bar.append(wrap);
    }
    wrap.replaceChildren();
    if (!figures) {
      bar.hidden = true;
      document.body.classList.remove("bar-open");
      return;
    }
    wrap.append(moneyLine("CURRENT RETAILER ESTIMATED ANNUAL COST", figures.a));
    wrap.append(moneyLine("ALTERNATIVE RETAILER ESTIMATED ANNUAL COST", figures.b));
    wrap.append(el("p", { class: figures.annual < 0 ? "big down" : "big" }, "ESTIMATED ANNUAL SAVING: " + figures.year));
    wrap.append(el("p", {}, "ESTIMATED MONTHLY SAVING: " + figures.month + " · ESTIMATED QUARTERLY SAVING: " + figures.quarter));
    bar.hidden = barSeen;
    document.body.classList.toggle("bar-open", !bar.hidden);
  }

  function paintOutputs() {
    paintComparison();
    syncExtra();
  }

  function paint() {
    document.getElementById("disclaimer").textContent = D.DISCLAIMER;
    document.getElementById("bill-status").textContent = state.messages.bill || "";
    syncKept();
    syncPlan();
    syncContext();
    syncRates();
    syncReload();
    syncExtra();
    paintOutputs();
  }

  function applyBillText(text) {
    var parsed = C.parseBill(text);
    var mode = document.getElementById("as-plan-doc").checked ? "plan-doc" : "bill";
    var applied = C.applyParsed(state, parsed, mode);
    state = applied.state;
    if (!applied.ok) {
      state = Object.assign({}, state, {
        messages: Object.assign({}, state.messages, { bill: applied.message })
      });
    } else if (parsed.hintTariff) {
      var tariff = D.tariffById(parsed.hintTariff);
      if (tariff) state = C.setContext(state, { customer: tariff.customer, fuel: tariff.fuel, tariff: tariff.id });
      state.messages = Object.assign({}, state.messages, { bill: applied.message });
    }
    save();
    paint();
    var target = document.getElementById(applied.ok ? "current-rates" : "bill-status");
    target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
  }

  function readBill() {
    applyBillText(document.getElementById("bill-text").value);
  }

  function readFile(file) {
    var status = document.getElementById("bill-status");
    if (!file) return;
    status.textContent = "Reading " + file.name + "…";
    var pending = /pdf$/i.test(file.name) || file.type === "application/pdf"
      ? file.arrayBuffer().then(function (buf) { return C.extractPdfText(new Uint8Array(buf)); })
      : file.text();
    pending.then(function (text) {
      if (!text || !String(text).trim()) {
        status.textContent = "No text could be read from that file. Paste the bill text, or type the rates. A photo of a bill is not read.";
        return;
      }
      document.getElementById("bill-text").value = text;
      applyBillText(text);
    }).catch(function () {
      status.textContent = "That file could not be read. Paste the bill text, or type the rates.";
    });
  }

  function openRank() {
    var ranked = C.rank(state, 5);
    var root = document.getElementById("dialog-root");
    var overlay = el("div", { class: "overlay" });
    var dialog = el("div", { class: "dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": "rank-title" });
    var close = el("button", { type: "button", class: "close", "aria-label": "Close" }, "×");
    dialog.append(close);
    dialog.append(el("h2", { id: "rank-title" }, "COMPARE AGAINST OTHER RETAILERS"));
    dialog.append(el("p", {}, D.DISCLAIMER));
    if (state.a.name) dialog.append(el("p", {}, "Retailer A stays " + state.a.name + ". Picking a row fills Retailer B only."));
    if (ranked.blocked) dialog.append(el("p", { class: "warn" }, ranked.blocked));
    else {
      dialog.append(el("p", {}, "Best " + ranked.rows.length + " of " + ranked.considered + " matching reference plans for this state, premises and tariff."));
      if (ranked.usage.incomplete) dialog.append(el("p", { class: "source-note" }, "Usage is incomplete, so the order uses the assumptions on the saving."));
    }
    var usage = ranked.usage;
    var aCost = C.annualCost(state.ctx.tariff, state.a, usage.resolved);
    ranked.rows.forEach(function (row, index) {
      var line = el("div", { class: "rank-row" });
      line.append(el("div", { class: "rank-no" }, String(index + 1)));
      var mid = el("div");
      mid.append(el("strong", {}, row.name));
      mid.append(el("div", {}, row.planName));
      var meta = row.variant === "lowusage" ? "ABC database sample" : "Sample reference";
      if (aCost.complete) {
        var delta = Math.round((aCost.normalised - row.cost.normalised) * 100) / 100;
        meta += " · " + (delta >= 0 ? "Lower by " : "Higher by ") + C.formatMoney(Math.abs(delta)) + " a year than " + (state.a.name || "Retailer A");
      }
      mid.append(el("div", { class: "rank-meta" }, meta));
      line.append(mid);
      line.append(el("div", { class: "cost" }, C.formatMoney(row.cost.normalised)));
      var links = el("div", { class: "rank-links" });
      var use = el("button", { type: "button", class: "use-btn" }, "Use as Retailer B");
      use.addEventListener("click", function () {
        commit(C.chooseRanked(state, row.retailerId, row.variant));
        closeDialog();
      });
      links.append(use);
      if (row.quoteUrl) links.append(el("a", { class: "quote secondary", href: row.quoteUrl, target: "_blank", rel: "noopener noreferrer" }, "Open plan page"));
      line.append(links);
      dialog.append(line);
    });
    overlay.append(dialog);
    root.replaceChildren(overlay);
    function closeDialog() {
      root.replaceChildren();
      document.getElementById("rank-button").focus();
    }
    close.addEventListener("click", closeDialog);
    overlay.addEventListener("mousedown", function (event) {
      if (event.target === overlay) closeDialog();
    });
    dialog.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDialog();
        return;
      }
      if (event.key !== "Tab") return;
      var nodes = dialog.querySelectorAll("button, a[href]");
      if (!nodes.length) return;
      var first = nodes[0];
      var last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    close.focus();
  }

  function resetCustomer() {
    if (!window.confirm("Clear this customer and start again?")) return;
    state = C.createState();
    usageSig = "";
    rateSig = "";
    planSig = "";
    panelOpen = false;
    try { sessionStorage.removeItem("qc-state-v1"); } catch (err) { /* ignore */ }
    document.getElementById("bill-text").value = "";
    document.getElementById("as-plan-doc").checked = false;
    document.getElementById("bill-file").value = "";
    comboA.setValue("");
    comboB.setValue("");
    comboC.setValue("");
    paint();
    document.getElementById("retailer-a-input").focus();
  }

  function init() {
    document.getElementById("disclaimer").textContent = D.DISCLAIMER;
    comboA = mountCombo(document.getElementById("retailer-a-search"), {
      inputId: "retailer-a-input",
      listId: "retailer-a-list",
      labelId: "who-heading",
      placeholder: "Search current retailer",
      openLabel: "Show retailers",
      onPick: pickCurrent
    });
    comboB = mountCombo(document.getElementById("retailer-b-search"), {
      inputId: "retailer-b-input",
      listId: "retailer-b-list",
      placeholder: "Search alternative retailer",
      openLabel: "Show alternative retailers",
      onPick: pickAlternative
    });
    buildContext();
    var extra = document.getElementById("extra-tools");
    var add = el("button", { type: "button", class: "ghost", id: "add-c" }, "Add another retailer");
    var panel = el("div", { id: "c-panel", hidden: "true" });
    panel.append(el("h3", {}, "Extra retailer"));
    var cSearch = el("div", { id: "retailer-c-search" });
    panel.append(cSearch);
    panel.append(el("div", { id: "retailer-c-selected" }));
    panel.append(el("div", { id: "c-rate-mount", class: "field-grid" }));
    var tools = el("div", { class: "tools" });
    var promote = el("button", { type: "button", class: "ghost", id: "promote-c" }, "Move to Retailer B");
    var remove = el("button", { type: "button", class: "ghost", id: "remove-c" }, "Remove extra retailer");
    tools.append(promote, remove);
    panel.append(tools);
    extra.append(add, panel);
    comboC = mountCombo(cSearch, {
      inputId: "retailer-c-input",
      listId: "retailer-c-list",
      placeholder: "Search another retailer",
      openLabel: "Show more retailers",
      onPick: pickExtra
    });
    add.addEventListener("click", function () {
      panelOpen = true;
      syncExtra();
      document.getElementById("retailer-c-input").focus();
    });
    promote.addEventListener("click", function () {
      if (!state.c || !state.c.name) return;
      commit(C.promoteExtra(state));
    });
    remove.addEventListener("click", function () {
      panelOpen = false;
      comboC.setValue("");
      commit(C.removeExtra(state));
    });

    document.getElementById("plan-select").addEventListener("change", function (event) {
      commit(C.selectPlan(state, event.target.value));
    });
    document.getElementById("read-bill").addEventListener("click", readBill);
    document.getElementById("bill-file").addEventListener("change", function (event) {
      var file = event.target.files && event.target.files[0];
      if (file) readFile(file);
    });
    var drop = document.getElementById("bill-drop");
    drop.addEventListener("dragover", function (event) { event.preventDefault(); });
    drop.addEventListener("drop", function (event) {
      event.preventDefault();
      var file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      if (file) readFile(file);
      else if (event.dataTransfer) applyBillText(event.dataTransfer.getData("text"));
    });
    document.getElementById("new-customer").addEventListener("click", resetCustomer);
    document.getElementById("rank-button").addEventListener("click", openRank);

    var block = document.getElementById("savings-mount");
    if ("IntersectionObserver" in window) {
      var observer = new IntersectionObserver(function (entries) {
        barSeen = entries[0].isIntersecting;
        var bar = document.getElementById("savings-bar");
        if (bar.querySelector(".big")) {
          bar.hidden = barSeen;
          document.body.classList.toggle("bar-open", !bar.hidden);
        }
      }, { threshold: 0.35 });
      observer.observe(block);
    }
    paint();
  }

  init();
})();
