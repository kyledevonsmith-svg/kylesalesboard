"use strict";
/* Quick Compare reference data.
   The home rank does not show these sample factors as a retailer price.
   Published plans live in public-plans.js, refreshed from retailer websites.
   Electricity caps for NSW, south-east Queensland and South Australia follow the
   AER Default Market Offer 2026–27 (1 July 2026 to 30 June 2027).
   Victorian figures follow the published Victorian Default Offer shape for 2026–27.
   Synergy, Aurora and Jacana market rows use tariffs published by those retailers
   for 1 July 2026. Everything else is a labelled sample. Last verified 14 November 2026. */
(function (root) {
  var VERIFIED_ISO = "2026-11-14";
  var VERIFIED_LABEL = "14 November 2026";
  var DISCLAIMER = "Only rates published on a retailer's own website are shown. Where a retailer has not published a price for this tariff, the card says so. A market offer that appears only after an address quote is not invented.";

  var NEM = ["NSW", "VIC", "QLD", "SA"];
  var NEM_ACT = ["NSW", "VIC", "QLD", "SA", "ACT"];

  function r3(n) {
    return Math.round(n * 1000) / 1000;
  }

  var REGIONS = {
    NSW: { id: "NSW", name: "New South Wales", exportKwh: 3200, exportNote: "Placeholder solar export for New South Wales (3,200 kWh/year). Not from the bill.", gasMj: 18000, gasNote: "Placeholder gas use for New South Wales (18,000 MJ/year). Replace it with the bill.", gas: { supply: 86, usage: 3.95 } },
    VIC: { id: "VIC", name: "Victoria", exportKwh: 3000, exportNote: "Placeholder solar export for Victoria (3,000 kWh/year). Not from the bill.", gasMj: 40000, gasNote: "Placeholder gas use for Victoria (40,000 MJ/year). Heating homes are often higher. Replace it with the bill.", gas: { supply: 104, usage: 3.45 } },
    QLD: { id: "QLD", name: "Queensland", exportKwh: 4000, exportNote: "Placeholder solar export for Queensland (4,000 kWh/year). Not from the bill.", gasMj: 8000, gasNote: "Placeholder gas use for Queensland (8,000 MJ/year). Replace it with the bill.", gas: { supply: 79, usage: 4.55 } },
    SA: { id: "SA", name: "South Australia", exportKwh: 3600, exportNote: "Placeholder solar export for South Australia (3,600 kWh/year). Not from the bill.", gasMj: 16000, gasNote: "Placeholder gas use for South Australia (16,000 MJ/year). Replace it with the bill.", gas: { supply: 92, usage: 4.2 } },
    ACT: { id: "ACT", name: "Australian Capital Territory", exportKwh: 3000, exportNote: "Placeholder solar export for the ACT (3,000 kWh/year). Not from the bill.", gasMj: 36000, gasNote: "Placeholder gas use for the ACT (36,000 MJ/year). Replace it with the bill.", gas: { supply: 96, usage: 3.8 } },
    TAS: { id: "TAS", name: "Tasmania", exportKwh: 2200, exportNote: "Placeholder solar export for Tasmania (2,200 kWh/year). Not from the bill.", gasMj: 24000, gasNote: "Placeholder gas use for Tasmania (24,000 MJ/year). Replace it with the bill.", gas: { supply: 88, usage: 3.6 } },
    WA: { id: "WA", name: "Western Australia", exportKwh: 3800, exportNote: "Placeholder solar export for Western Australia (3,800 kWh/year). Not from the bill. The buyback is a regulated scheme, not a flat retailer feed-in.", gasMj: 14000, gasNote: "Placeholder gas use for Western Australia (14,000 MJ/year). Replace it with the bill.", gas: { supply: 78, usage: 3.15 } },
    NT: { id: "NT", name: "Northern Territory", exportKwh: 4200, exportNote: "Placeholder solar export for the Northern Territory (4,200 kWh/year). Not from the bill.", gasMj: 0, gasNote: "No reference gas market is included for the Northern Territory.", gas: null }
  };

  var FIT_SCALE = { NSW: 1, VIC: 0.5, QLD: 1.1, SA: 0.8, ACT: 1.15, TAS: 1.25, NT: 1, WA: 0 };

  function win(peak, shoulder, offpeak, soak) {
    var w = {};
    if (peak) w.windowPeak = peak;
    if (shoulder) w.windowShoulder = shoulder;
    if (offpeak) w.windowOffpeak = offpeak;
    if (soak) w.windowSoak = soak;
    return w;
  }

  var PRESET_WINDOWS = {
    tou: {
      NSW: win("Weekdays 3:00pm–9:00pm", "Weekdays 7:00am–3:00pm and 9:00pm–10:00pm; weekends 7:00am–10:00pm", "Every day 10:00pm–7:00am"),
      VIC: win("Weekdays 3:00pm–9:00pm", "Weekdays 7:00am–3:00pm and 9:00pm–10:00pm; weekends 7:00am–10:00pm", "Every day 10:00pm–7:00am"),
      QLD: win("Weekdays 4:00pm–9:00pm", "Weekdays 7:00am–4:00pm and 9:00pm–10:00pm", "Every day 10:00pm–7:00am"),
      SA: win("Weekdays 5:00pm–9:00pm", "Weekdays 7:00am–5:00pm and 9:00pm–10:00pm", "Every day 10:00pm–7:00am"),
      ACT: win("Weekdays 3:00pm–9:00pm", "Weekdays 7:00am–3:00pm and 9:00pm–10:00pm", "Every day 10:00pm–7:00am"),
      TAS: win("Weekdays 7:00am–10:00am and 4:00pm–9:00pm", "Weekdays 10:00am–4:00pm", "Every day 9:00pm–7:00am, and weekends"),
      WA: win("Weekdays 3:00pm–9:00pm", "Weekdays 7:00am–3:00pm", "Every day 9:00pm–7:00am"),
      NT: win("Weekdays 3:00pm–9:00pm", "Weekdays 9:00am–3:00pm", "Every day 9:00pm–9:00am")
    },
    two: {
      NSW: win("Weekdays 3:00pm–9:00pm", null, "All other hours"),
      VIC: win("Weekdays 3:00pm–9:00pm", null, "All other hours"),
      QLD: win("Weekdays 4:00pm–9:00pm", null, "All other hours"),
      SA: win("Weekdays 6:00am–10:00am and 3:00pm–10:00pm", null, "All other hours"),
      ACT: win("Weekdays 7:00am–9:00am and 5:00pm–8:00pm", null, "All other hours"),
      TAS: win("Weekdays 7:00am–10:00am and 4:00pm–9:00pm (AEST)", null, "All other hours, including weekends"),
      WA: win("Every day 3:00pm–9:00pm", null, "All other hours"),
      NT: win("All hours except 9:00am–3:00pm", null, "Every day 9:00am–3:00pm")
    },
    soak: {
      NSW: win("Weekdays 3:00pm–9:00pm", null, "All other hours", "Every day 10:00am–2:00pm"),
      VIC: win("Weekdays 4:00pm–9:00pm", null, "Every day 9:00pm–11:00am", "Every day 11:00am–4:00pm"),
      QLD: win("Weekdays 4:00pm–9:00pm", null, "Every day 9:00pm–11:00am", "Every day 11:00am–4:00pm"),
      SA: win("Weekdays 6:00am–10:00am and 4:00pm–midnight", null, "Midnight–6:00am", "Every day 10:00am–4:00pm"),
      ACT: win("Weekdays 4:00pm–9:00pm", null, "Every day 9:00pm–11:00am", "Every day 11:00am–4:00pm"),
      TAS: win("Weekdays 4:00pm–9:00pm", null, "Every day 9:00pm–10:00am", "Every day 10:00am–4:00pm"),
      WA: win("Every day 3:00pm–9:00pm", null, "Every day 9:00pm–9:00am", "Every day 9:00am–3:00pm"),
      NT: win("All hours except 9:00am–3:00pm", null, "Not used on this two-rate shape", "Every day 9:00am–3:00pm")
    }
  };

  function preset(family, region) {
    var table = PRESET_WINDOWS[family] || PRESET_WINDOWS.tou;
    return Object.assign({}, table[region] || table.NSW);
  }

  function net(p) {
    return {
      id: p.id,
      name: p.name,
      region: p.region,
      quality: p.quality,
      annualKwh: p.annualKwh,
      annualNote: p.annualNote,
      clKwh: p.clKwh,
      clNote: p.clNote,
      businessKwh: p.businessKwh || 10000,
      businessNote: p.businessNote || "Small-business usage assumed at 10,000 kWh/year, the benchmark used with the 2026–27 default offer. Not this customer's meter.",
      flat: p.flat,
      flatPlanLabel: p.flatPlanLabel || "",
      businessFlat: p.businessFlat || null,
      structures: p.structures || {},
      cl: p.cl || null,
      demand: p.demand,
      flatNote: p.flatNote || ""
    };
  }

  var DMO_CL_NOTE = "Controlled-load cents are a sample in the range of the 2026–27 default-offer controlled-load caps. They are not a figure copied off a retailer schedule.";
  var BIZ_NOTE = "Small-business flat cap from the AER 2026–27 default offer, GST inclusive. A cap, not a retailer price.";

  var NETWORKS = [
    net({
      id: "ausgrid", name: "Ausgrid", region: "NSW", quality: "regulator-cap",
      annualKwh: 3900, annualNote: "Ausgrid residential benchmark in the AER default offer for 2026–27 (3,900 kWh). Not this customer's meter.",
      clKwh: 2000, clNote: "Ausgrid controlled-load benchmark in the 2026–27 default offer (2,000 kWh). Not this customer's meter.",
      flat: { supply: 166.229, usage: 33.137 },
      businessFlat: { supply: 372.748, usage: 31.629, note: BIZ_NOTE },
      cl: { cl1: 19.309, cl2: 16.432, clSupply: 4.731, note: DMO_CL_NOTE },
      demand: 18.5,
      structures: {
        two: {
          supply: 176.411, peak: 60.197, offpeak: 24.039,
          quality: "regulator-cap",
          planLabel: "",
          windows: win("Weekdays 3:00pm–9:00pm in November–March and June–August. In other months those hours are off-peak.", null, "All other hours, at the published off-peak cap"),
          note: "Ausgrid residential time-of-use cap from the AER 2026–27 determination. Two bands, not peak / shoulder / off-peak.",
          seasonal: "The published peak does not apply in April, May, September and October. This comparison still prices the peak kWh at the peak cap, so treat the annual figure as an estimate."
        }
      }
    }),
    net({
      id: "endeavour", name: "Endeavour Energy", region: "NSW", quality: "regulator-cap",
      annualKwh: 4900, annualNote: "Endeavour Energy residential benchmark in the AER default offer for 2026–27 (4,900 kWh). Not this customer's meter.",
      clKwh: 2200, clNote: "Endeavour Energy controlled-load benchmark in the 2026–27 default offer (2,200 kWh).",
      flat: { supply: 185.135, usage: 33.727 },
      businessFlat: { supply: 244.138, usage: 34.52, note: BIZ_NOTE },
      cl: { cl1: 20.644, cl2: 16.745, clSupply: 8.878, note: DMO_CL_NOTE },
      demand: 16.5,
      structures: {
        soak: {
          supply: 185.135, peak: 46.855, soak: 12.348, offpeak: 35.691,
          quality: "regulator-cap",
          windows: win("Working weekdays 4:00pm–8:00pm. Reference uses the average of the high-season and low-season peak caps.", null, "All other hours, including weekends outside the solar-soak window", "Every day 10:00am–2:00pm"),
          note: "Endeavour Energy residential time-of-use cap from the AER 2026–27 determination: peak, solar soak and off-peak.",
          seasonal: "Published peak is about 46.57c in November–March and 47.14c in April–October. This reference uses 46.855c all year."
        }
      }
    }),
    net({
      id: "essential", name: "Essential Energy", region: "NSW", quality: "regulator-cap",
      annualKwh: 4600, annualNote: "Essential Energy residential benchmark in the AER default offer for 2026–27 (4,600 kWh). Not this customer's meter.",
      clKwh: 2000, clNote: "Essential Energy controlled-load benchmark in the 2026–27 default offer (2,000 kWh).",
      flat: { supply: 272.217, usage: 35.005 },
      businessFlat: { supply: 405.654, usage: 40.367, note: BIZ_NOTE },
      cl: { cl1: 22.086, cl2: 19.889, clSupply: 13.893, note: DMO_CL_NOTE },
      demand: 22,
      structures: {
        two: {
          supply: 272.217, peak: 42.119, offpeak: 24.145,
          quality: "regulator-cap",
          windows: win("7:00am–10:00am and 3:00pm–10:00pm", null, "All other hours"),
          note: "Essential Energy residential time-of-use cap from the AER 2026–27 determination. Peak and off-peak only."
        }
      }
    }),
    net({
      id: "citipower", name: "CitiPower", region: "VIC", quality: "regulator-cap",
      annualKwh: 4000, annualNote: "Victorian residential usage assumed at 4,000 kWh/year for CitiPower. This is a sales-floor placeholder, not a cited Victorian benchmark and not the customer's meter.",
      clKwh: 1500, clNote: "Controlled load assumed at 1,500 kWh/year for this Victorian network. Not a cited benchmark.",
      flat: { supply: 121.14, usage: 25.96 },
      cl: { cl1: 16.5, cl2: 14.2, clSupply: 6.5, note: "Sample Victorian controlled-load rates. Not a Victorian Default Offer transcription." },
      demand: 15,
      structures: {
        soak: {
          supply: 121.14, peak: 38.31, soak: 16.59, offpeak: 21.17,
          quality: "regulator-cap",
          windows: win("Weekdays 4:00pm–9:00pm", null, "Every day 9:00pm–11:00am", "Every day 11:00am–4:00pm"),
          note: "CitiPower residential time-of-use shape from the 2026–27 Victorian Default Offer: peak, solar soak and off-peak."
        }
      }
    }),
    net({
      id: "jemena", name: "Jemena", region: "VIC", quality: "regulator-cap",
      annualKwh: 4000, annualNote: "Victorian residential usage assumed at 4,000 kWh/year for Jemena. Placeholder, not the customer's meter.",
      clKwh: 1500, clNote: "Controlled load assumed at 1,500 kWh/year. Not a cited benchmark.",
      flat: { supply: 127.13, usage: 27.47 },
      cl: { cl1: 17.2, cl2: 14.8, clSupply: 7, note: "Sample Victorian controlled-load rates." },
      demand: 15.5,
      structures: {
        soak: {
          supply: 127.12, peak: 37.57, soak: 17.65, offpeak: 21.76,
          quality: "regulator-cap",
          windows: win("Weekdays 4:00pm–9:00pm", null, "Every day 9:00pm–11:00am", "Every day 11:00am–4:00pm"),
          note: "Jemena residential time-of-use shape from the 2026–27 Victorian Default Offer."
        }
      }
    }),
    net({
      id: "powercor", name: "Powercor", region: "VIC", quality: "regulator-cap",
      annualKwh: 4000, annualNote: "Victorian residential usage assumed at 4,000 kWh/year for Powercor. Placeholder, not the customer's meter.",
      clKwh: 1600, clNote: "Controlled load assumed at 1,600 kWh/year. Not a cited benchmark.",
      flat: { supply: 138.05, usage: 28.22 },
      cl: { cl1: 17.6, cl2: 15.1, clSupply: 8, note: "Sample Victorian controlled-load rates." },
      demand: 16,
      structures: {
        soak: {
          supply: 138.05, peak: 41.67, soak: 17.26, offpeak: 22.49,
          quality: "regulator-cap",
          windows: win("Weekdays 4:00pm–9:00pm", null, "Every day 9:00pm–11:00am", "Every day 11:00am–4:00pm"),
          note: "Powercor residential time-of-use shape from the 2026–27 Victorian Default Offer."
        }
      }
    }),
    net({
      id: "ausnet", name: "AusNet Services", region: "VIC", quality: "regulator-cap",
      annualKwh: 4000, annualNote: "Victorian residential usage assumed at 4,000 kWh/year for AusNet Services. Placeholder, not the customer's meter.",
      clKwh: 1700, clNote: "Controlled load assumed at 1,700 kWh/year. Not a cited benchmark.",
      flat: { supply: 128.24, usage: 31.98 },
      cl: { cl1: 18.4, cl2: 15.6, clSupply: 8.5, note: "Sample Victorian controlled-load rates." },
      demand: 17,
      structures: {
        soak: {
          supply: 128.24, peak: 47.64, soak: 17.59, offpeak: 22.6,
          quality: "regulator-cap",
          windows: win("Weekdays 4:00pm–9:00pm", null, "Every day 9:00pm–11:00am", "Every day 11:00am–4:00pm"),
          note: "AusNet Services residential time-of-use shape from the 2026–27 Victorian Default Offer."
        }
      }
    }),
    net({
      id: "united", name: "United Energy", region: "VIC", quality: "regulator-cap",
      annualKwh: 4000, annualNote: "Victorian residential usage assumed at 4,000 kWh/year for United Energy. Placeholder, not the customer's meter.",
      clKwh: 1500, clNote: "Controlled load assumed at 1,500 kWh/year. Not a cited benchmark.",
      flat: { supply: 119.12, usage: 27.35 },
      cl: { cl1: 16.8, cl2: 14.4, clSupply: 6.5, note: "Sample Victorian controlled-load rates." },
      demand: 15,
      structures: {
        soak: {
          supply: 119.12, peak: 40.32, soak: 17.26, offpeak: 22.14,
          quality: "regulator-cap",
          windows: win("Weekdays 4:00pm–9:00pm", null, "Every day 9:00pm–11:00am", "Every day 11:00am–4:00pm"),
          note: "United Energy residential time-of-use shape from the 2026–27 Victorian Default Offer."
        }
      }
    }),
    net({
      id: "energex", name: "Energex", region: "QLD", quality: "regulator-cap",
      annualKwh: 4600, annualNote: "Energex residential benchmark in the AER default offer for 2026–27 (4,600 kWh). Not this customer's meter.",
      clKwh: 1900, clNote: "Energex controlled-load benchmark in the 2026–27 default offer (1,900 kWh).",
      flat: { supply: 192.016, usage: 27.974 },
      businessFlat: { supply: 261.626, usage: 28.936, note: BIZ_NOTE },
      cl: { cl1: 19.889, cl2: 16.745, clSupply: 8.878, note: DMO_CL_NOTE },
      demand: 14.5,
      structures: {
        tou: {
          supply: 177.853, peak: 47.786, shoulder: 25.296, offpeak: 6.985,
          quality: "regulator-cap",
          windows: win("Weekdays 4:00pm–9:00pm", "9:00pm–11:00am", "11:00am–4:00pm"),
          note: "Energex residential time-of-use cap from the AER 2026–27 determination. The cheap band is the middle of the day (published as off-peak, 11am–4pm), and the long shoulder is 9pm–11am. Those windows are not a night off-peak."
        }
      }
    }),
    net({
      id: "ergon-net", name: "Ergon network (regional Queensland)", region: "QLD", quality: "sample",
      annualKwh: 4600, annualNote: "Regional Queensland usage assumed at 4,600 kWh/year, the Energex benchmark. Not an Ergon meter read.",
      clKwh: 1900, clNote: "Controlled load assumed at 1,900 kWh/year.",
      flat: { supply: 181, usage: 28.5 },
      flatNote: "Sample regional Queensland flat rate. Supply is a rounded 181c/day from public summaries of the 2026–27 Ergon standing offer. Usage is a sample 28.5c. It is not a town tariff and not a copy of Ergon's schedule. The Queensland government uniform tariff policy means regional bills are not the same shape as south-east Queensland.",
      cl: { cl1: 18.5, cl2: 15.5, clSupply: 10, note: "Sample controlled-load rates for regional Queensland." },
      demand: 14.5
    }),
    net({
      id: "sapn", name: "SA Power Networks", region: "SA", quality: "regulator-cap",
      annualKwh: 4000, annualNote: "SA Power Networks residential benchmark in the AER default offer for 2026–27 (4,000 kWh). Not this customer's meter.",
      clKwh: 1800, clNote: "SA Power Networks controlled-load benchmark in the 2026–27 default offer (1,800 kWh).",
      flat: { supply: 180.051, usage: 41.91 },
      businessFlat: { supply: 185.581, usage: 44.845, note: BIZ_NOTE },
      cl: { cl1: 22.25, cl2: 18.4, clSupply: 15.661, note: DMO_CL_NOTE },
      demand: 19,
      structures: {
        soak: {
          supply: 180.051, peak: 56.222, soak: 17.043, offpeak: 32.551,
          quality: "regulator-cap",
          windows: win("Weekdays 6:00am–10:00am and 4:00pm–midnight, on the summer workday pattern", null, "Midnight–6:00am", "Every day 10:00am–4:00pm"),
          note: "SA Power Networks residential time-of-use cap from the AER 2026–27 determination: peak, solar sponge and off-peak.",
          seasonal: "The published South Australian windows change by season and by weekday. This reference keeps one pattern all year, so the annual figure is an estimate."
        }
      }
    }),
    net({
      id: "evoenergy", name: "Evoenergy", region: "ACT", quality: "sample-aligned",
      annualKwh: 6100, annualNote: "6,100 kWh/year, the annual usage ActewAGL publishes against its regulated Home plan. Not this customer's meter.",
      clKwh: 2000, clNote: "Controlled load assumed at 2,000 kWh/year for the ACT. Not a cited benchmark.",
      flat: { supply: 134, usage: 36.966 },
      flatNote: "Reference split so that 134.00c/day plus 36.966c/kWh lands on ActewAGL's published Home annual price of $2,744 at 6,100 kWh (public price page, from 1 July 2026). The 134c supply figure is a secondary summary, not a line re-read from the PDF schedule. Treat the split as a sample.",
      cl: { cl1: 20.5, cl2: 17.2, clSupply: 8, note: "Sample ACT controlled-load rates." },
      demand: 16
    }),
    net({
      id: "tasnetworks", name: "TasNetworks", region: "TAS", quality: "published-tariff",
      annualKwh: 7500, annualNote: "Tasmanian residential usage assumed at 7,500 kWh/year. Heating load is often higher. Not an Aurora meter read.",
      clKwh: 2200, clNote: "Night-rate usage assumed at 2,200 kWh/year. Not a meter read.",
      flatPlanLabel: "Residential Single Rate (Tariff 32)",
      flat: { supply: 182, usage: 24.75 },
      flatNote: "Aurora Energy residential single rate (Tariff 31/32), daily supply 182.000c and usage 24.750c, published for 1 July 2026.",
      cl: { cl1: 14.022, cl2: null, clSupply: 23.366, note: "Aurora Tariff 62 night rate, 14.022c/kWh, plus its own supply 23.366c/day, published for 1 July 2026. There is no second controlled load in this reference." },
      demand: 17,
      structures: {
        two: {
          supply: 172.347, peak: 36.188, offpeak: 17.02,
          quality: "published-tariff",
          planLabel: "Peak and Off-peak (Tariff 93)",
          windows: win("Weekdays 7:00am–10:00am and 4:00pm–9:00pm AEST (8:00am–11:00am and 5:00pm–10:00pm during daylight saving)", null, "All other hours, including weekends"),
          note: "Aurora Energy Peak and Off-peak (Tariff 93), published for 1 July 2026. No shoulder band."
        },
        controlled: {
          supply: 182, usage: 24.75, cl1: 14.022, clSupply: 23.366,
          quality: "published-tariff",
          planLabel: "Single rate plus night rate (Tariff 32 and Tariff 62)",
          note: "Aurora Tariff 32 general usage plus Tariff 62 night rate, published for 1 July 2026."
        }
      }
    }),
    net({
      id: "westernpower", name: "Western Power", region: "WA", quality: "published-tariff",
      annualKwh: 5190, annualNote: "Western Australian residential usage assumed at 5,190 kWh/year. Not a Synergy meter read.",
      clKwh: 1800, clNote: "Hot-water usage assumed at 1,800 kWh/year. Not a meter read.",
      flatPlanLabel: "Home Plan (A1)",
      flat: { supply: 119.242, usage: 33.262 },
      flatNote: "Synergy Home Plan (A1), supply 119.2419c/day and usage 33.2621c/kWh, GST inclusive, from 1 July 2026.",
      businessFlat: { supply: 212.881, usage: 33.128, planLabel: "Business Plan (L1)", note: "Synergy Business Plan (L1), supply 212.8808c/day and the first-block usage 33.1278c/kWh, GST inclusive, from 1 July 2026. A higher block applies above 1,650 kWh a day. This comparison does not price that block." },
      cl: { cl1: 13.879, cl2: null, clSupply: 25.124, note: "Synergy Hot Water Plan (B1), 13.879c/kWh and supply 25.124c/day, on top of Home Plan (A1). Published for 1 July 2026." },
      demand: 16,
      structures: {
        soak: {
          supply: 132.781, peak: 55.325, soak: 8.852, offpeak: 24.343,
          quality: "published-tariff",
          planLabel: "Midday Saver",
          windows: win("Every day 3:00pm–9:00pm", null, "Every day 9:00pm–9:00am", "Every day 9:00am–3:00pm (Synergy calls this super off-peak)"),
          note: "Synergy Midday Saver, published for 1 July 2026. Three bands. The cheap middle of the day is not a night off-peak."
        },
        controlled: {
          supply: 119.242, usage: 33.262, cl1: 13.879, clSupply: 25.124,
          quality: "published-tariff",
          planLabel: "Home Plan (A1) plus Hot Water (B1)",
          note: "Synergy Home Plan (A1) plus Hot Water Plan (B1), published for 1 July 2026."
        },
        businessTwo: {
          supply: 398.06, peak: 43.173, offpeak: 12.952,
          quality: "published-tariff",
          planLabel: "Business Time of Use (R1)",
          windows: win("8:00am–10:00pm", null, "10:00pm–8:00am weekdays, and all weekend"),
          note: "Synergy Business Time of Use (R1), published for 1 July 2026. Peak and off-peak only. No shoulder."
        }
      }
    }),
    net({
      id: "horizon-net", name: "Horizon Power network", region: "WA", quality: "sample",
      annualKwh: 6000, annualNote: "Regional Western Australia usage assumed at 6,000 kWh/year. Horizon town tariffs differ. Not a meter read.",
      clKwh: 1800, clNote: "Controlled load assumed at 1,800 kWh/year.",
      flat: { supply: 119.242, usage: 33.262 },
      flatNote: "Sample only. Supply is set to the same 119.242c/day quoted for Horizon in a 2026–27 supply summary, and usage is copied from the Synergy Home Plan so the page has a number. Horizon town tariffs are different. Replace both figures from the bill.",
      cl: { cl1: 16, cl2: 14, clSupply: 12, note: "Sample controlled-load rates. Not a Horizon town tariff." },
      demand: 20
    }),
    net({
      id: "powerwater", name: "Power and Water", region: "NT", quality: "published-tariff",
      annualKwh: 8000, annualNote: "Northern Territory residential usage assumed at 8,000 kWh/year. Not a Jacana meter read. Jacana's residential unit rate applies to the first 164 kWh a day averaged over the bill; this comparison does not price the business rate above that.",
      clKwh: 2000, clNote: "Controlled load assumed at 2,000 kWh/year. Not a Jacana product.",
      flatPlanLabel: "Standard Residential",
      flat: { supply: 62.45, usage: 31.679 },
      flatNote: "Jacana Energy Standard Residential, 62.45c/day and 31.6788c/kWh including GST, 1 July 2026 to 30 June 2027.",
      cl: { cl1: 20, cl2: 17, clSupply: 0, note: "Sample controlled-load rates. Jacana's public residential page used here does not list a separate controlled load." },
      demand: 18,
      structures: {
        two: {
          supply: 62.45, peak: 33.217, offpeak: 25.829,
          quality: "published-tariff",
          planLabel: "Time of Use",
          windows: win("All hours except 9:00am–3:00pm", null, "Every day 9:00am–3:00pm"),
          note: "Jacana Energy residential time of use, published for 1 July 2026. The cheaper band is the middle of the day, not overnight. Two rates only."
        }
      }
    })
  ];

  function R(p) {
    return {
      id: p.id,
      name: p.name,
      aliases: p.aliases || [],
      electricity: p.electricity || [],
      gas: p.gas || [],
      businessElectricity: p.businessElectricity === undefined ? (p.electricity || []).slice() : p.businessElectricity,
      businessGas: p.businessGas === undefined ? (p.gas || []).slice() : p.businessGas,
      quoteUrl: p.quoteUrl || "",
      businessUrl: p.businessUrl || p.quoteUrl || "",
      factor: { usage: p.factor[0], supply: p.factor[1], fit: p.factor[2] },
      publishedDirect: !!p.publishedDirect,
      amber: !!p.amber,
      legacy: !!p.legacy,
      embedded: !!p.embedded,
      note: p.note || ""
    };
  }

  var RETAILERS = [
    R({ id: "agl", name: "AGL", aliases: ["AGL Energy"], electricity: NEM.slice(), gas: NEM.concat(["WA"]), quoteUrl: "https://www.agl.com.au/residential/energy/compare-plans", businessUrl: "https://www.agl.com.au/business", factor: [0.97, 1.02, 5.6] }),
    R({ id: "origin", name: "Origin Energy", aliases: ["Origin"], electricity: NEM_ACT.slice(), gas: NEM_ACT.concat(["WA"]), quoteUrl: "https://www.originenergy.com.au/electricity-gas/plans.html", businessUrl: "https://www.originenergy.com.au/business.html", factor: [0.96, 1.01, 6.2] }),
    R({ id: "energyaustralia", name: "EnergyAustralia", aliases: ["Energy Australia", "EA"], electricity: NEM_ACT.slice(), gas: ["NSW", "VIC", "SA", "ACT"], quoteUrl: "https://www.energyaustralia.com.au/home/electricity-and-gas/plans", businessUrl: "https://www.energyaustralia.com.au/business", factor: [0.975, 1.02, 5.8] }),
    R({ id: "engie", name: "ENGIE", aliases: [], electricity: NEM.slice(), gas: ["VIC", "SA"], quoteUrl: "https://engie.com.au/residential/electricity-and-gas-plans/compare-electricity-and-gas-plans", businessUrl: "https://engie.com.au/business", factor: [0.95, 1, 5.4] }),
    R({ id: "alinta", name: "Alinta Energy", aliases: ["Alinta"], electricity: NEM.slice(), gas: ["VIC", "QLD", "SA", "WA"], quoteUrl: "https://www.alintaenergy.com.au/residential/electricity-and-gas/", businessUrl: "https://www.alintaenergy.com.au/business/", factor: [0.93, 1, 5.2] }),
    R({ id: "red", name: "Red Energy", aliases: [], electricity: NEM_ACT.slice(), gas: NEM_ACT.slice(), quoteUrl: "https://www.redenergy.com.au/plans", factor: [0.95, 1.01, 7.2] }),
    R({ id: "lumo", name: "Lumo Energy", aliases: ["Lumo"], electricity: ["VIC", "SA"], gas: ["VIC", "SA"], quoteUrl: "https://www.lumoenergy.com.au/", factor: [0.94, 1, 6.8] }),
    R({ id: "simply", name: "Simply Energy", aliases: [], electricity: NEM.slice(), gas: ["VIC", "SA"], quoteUrl: "https://www.simplyenergy.com.au/", note: "Simply Energy is now sold as ENGIE. Keep the name when it is the one on the bill.", factor: [0.955, 1.005, 5.2] }),
    R({ id: "momentum", name: "Momentum Energy", aliases: ["Momentum"], electricity: NEM.slice(), gas: ["VIC"], quoteUrl: "https://www.momentumenergy.com.au/", factor: [0.93, 1, 8.5] }),
    R({ id: "powershop", name: "Powershop", aliases: [], electricity: NEM.slice(), gas: NEM.slice(), quoteUrl: "https://www.powershop.com.au/", factor: [0.92, 0.99, 6] }),
    R({ id: "amber", name: "Amber", aliases: ["Amber Electric"], electricity: NEM_ACT.slice(), gas: [], quoteUrl: "https://www.amber.com.au/", factor: [0.95, 0.9, 4], amber: true, note: "Wholesale pass-through. The sample usage rate is an annualised stand-in, not a half-hour forecast." }),
    R({ id: "globird", name: "GloBird Energy", aliases: ["GloBird", "Globird", "Glo Bird"], electricity: NEM_ACT.slice(), gas: NEM.slice(), quoteUrl: "https://www.globirdenergy.com.au/", factor: [0.86, 0.94, 4] }),
    R({ id: "ovo", name: "OVO Energy", aliases: ["OVO"], electricity: NEM.slice(), gas: [], quoteUrl: "https://www.ovoenergy.com.au/", factor: [0.885, 0.96, 5] }),
    R({ id: "dodo", name: "Dodo", aliases: ["Dodo Power & Gas", "Dodo Power and Gas"], electricity: NEM_ACT.slice(), gas: NEM_ACT.slice(), quoteUrl: "https://www.dodo.com/energy", factor: [0.84, 0.93, 3.2] }),
    R({ id: "tango", name: "Tango Energy", aliases: ["Tango"], electricity: NEM.slice(), gas: ["VIC"], quoteUrl: "https://www.tangoenergy.com/", factor: [0.9, 0.98, 5.4] }),
    R({ id: "sumo", name: "Sumo", aliases: ["Sumo Power"], electricity: NEM_ACT.slice(), gas: ["VIC"], quoteUrl: "https://www.sumo.com.au/", legacy: true, note: "Legacy brand. Confirm the company still sells at this address before quoting.", factor: [0.9, 0.96, 4] }),
    R({ id: "actewagl", name: "ActewAGL", aliases: ["Actew AGL"], electricity: ["ACT", "NSW"], gas: ["ACT", "VIC"], quoteUrl: "https://www.actewagl.com.au/legal/pricing-information/act-home-prices", factor: [0.99, 1.01, 7] }),
    R({ id: "ergon", name: "Ergon Energy", aliases: ["Ergon"], electricity: ["QLD"], gas: [], quoteUrl: "https://www.ergon.com.au/retail", factor: [1, 1, 8], note: "Reference retailer for regional Queensland. Not given sample rates on the Energex network." }),
    R({ id: "synergy", name: "Synergy", aliases: [], electricity: ["WA"], gas: [], quoteUrl: "https://www.synergy.net.au/Global/Synergy-Price-Changes-2026", publishedDirect: true, factor: [1, 1, 0], note: "South West grid. Sample feed-in is left blank because the buyback is the regulated DEBS scheme, not a flat retailer rate." }),
    R({ id: "horizon", name: "Horizon Power", aliases: ["Horizon"], electricity: ["WA"], gas: [], quoteUrl: "https://www.horizonpower.com.au/", factor: [1, 1, 0], note: "Regional Western Australia. Town tariffs differ from this sample." }),
    R({ id: "jacana", name: "Jacana Energy", aliases: ["Jacana"], electricity: ["NT"], gas: [], quoteUrl: "https://www.jacanaenergy.com.au/residential/pricing", publishedDirect: true, factor: [1, 1, 9] }),
    R({ id: "aurora", name: "Aurora Energy", aliases: ["Aurora"], electricity: ["TAS"], gas: ["TAS"], quoteUrl: "https://www.auroraenergy.com.au/residential/products/residential-all-prices", publishedDirect: true, factor: [1, 1, 6.8] }),
    R({ id: "first", name: "1st Energy", aliases: ["1st", "First Energy"], electricity: ["NSW", "VIC", "QLD", "SA", "TAS"], gas: ["VIC"], quoteUrl: "https://www.1stenergy.com.au/", factor: [0.88, 0.95, 4.4] }),
    R({ id: "diamond", name: "Diamond Energy", aliases: ["Diamond"], electricity: NEM_ACT.slice(), gas: [], quoteUrl: "https://www.diamondenergy.com.au/", factor: [0.98, 1.03, 10] }),
    R({ id: "energylocals", name: "Energy Locals", aliases: ["Energy Locals Urban"], electricity: NEM_ACT.slice(), gas: [], quoteUrl: "https://energylocals.com.au/", factor: [0.94, 0.98, 6.5], note: "Some offers are white-label. Confirm the brand on the quote page." }),
    R({ id: "kogan", name: "Kogan Energy", aliases: ["Kogan"], electricity: NEM_ACT.slice(), gas: NEM.slice(), businessElectricity: [], businessGas: [], quoteUrl: "https://www.koganenergy.com.au/", factor: [0.89, 0.97, 4.2] }),
    R({ id: "nectr", name: "nectr", aliases: ["Nectr"], electricity: NEM_ACT.slice(), gas: [], quoteUrl: "https://www.nectr.com.au/", factor: [0.87, 0.94, 3.6] }),
    R({ id: "covau", name: "CovaU", aliases: ["Covau"], electricity: NEM_ACT.concat(["TAS"]), gas: NEM_ACT.slice(), quoteUrl: "https://www.covau.com.au/", factor: [0.91, 0.97, 4.6] }),
    R({ id: "bluenrg", name: "Blue NRG", aliases: ["BlueNRG"], electricity: NEM_ACT.slice(), gas: [], quoteUrl: "https://www.bluenrg.com.au/", factor: [0.86, 0.94, 0], note: "Stronger in business electricity than in household plans." }),
    R({ id: "flow", name: "Flow Power", aliases: ["Flow"], electricity: NEM_ACT.slice(), gas: [], quoteUrl: "https://flowpower.com.au/", factor: [0.88, 0.96, 5] }),
    R({ id: "reamped", name: "ReAmped Energy", aliases: ["ReAmped", "Reamped"], electricity: NEM.slice(), gas: [], quoteUrl: "https://www.reampedenergy.com.au/", factor: [0.91, 0.97, 4.8] }),
    R({ id: "discover", name: "Discover Energy", aliases: ["Discover"], electricity: NEM.slice(), gas: [], quoteUrl: "https://www.discoverenergy.com.au/", factor: [0.92, 0.98, 5] }),
    R({ id: "futurex", name: "Future X Power", aliases: ["Future X"], electricity: NEM_ACT.slice(), gas: [], quoteUrl: "https://www.futurexpower.com.au/", factor: [0.895, 0.96, 4.1] }),
    R({ id: "solstice", name: "Solstice Energy", aliases: ["Solstice"], electricity: ["TAS"], gas: [], quoteUrl: "https://www.solsticeenergy.com.au/", factor: [0.96, 0.98, 7.5] }),
    R({ id: "kleenheat", name: "Kleenheat", aliases: [], electricity: [], gas: ["WA"], quoteUrl: "https://www.kleenheat.com.au/", factor: [0.97, 0.99, 0] }),
    R({ id: "rimfire", name: "Rimfire Energy", aliases: ["Rimfire"], electricity: ["NT"], gas: [], quoteUrl: "https://www.rimfireenergy.com.au/", factor: [0.97, 0.99, 8] }),
    R({ id: "shell", name: "Shell Energy", aliases: [], electricity: [], businessElectricity: NEM_ACT.slice(), gas: [], quoteUrl: "https://shellenergy.com.au/", factor: [0.9, 0.97, 0], note: "Business electricity." }),
    R({ id: "nextbusiness", name: "Next Business Energy", aliases: ["Next Business"], electricity: NEM_ACT.slice(), gas: [], quoteUrl: "https://www.nextbusinessenergy.com.au/", factor: [0.89, 0.95, 3.5] }),
    R({ id: "perth", name: "Perth Energy", aliases: [], electricity: [], businessElectricity: ["WA"], gas: [], quoteUrl: "https://www.perthenergy.com.au/", factor: [0.94, 0.98, 0], note: "Business electricity in Western Australia." }),
    R({ id: "indigo", name: "Indigo Power", aliases: ["Indigo"], electricity: ["ACT", "NSW", "QLD", "VIC"], gas: [], quoteUrl: "https://www.indigopower.com.au/", factor: [0.96, 1.02, 7.5] }),
    R({ id: "flipped", name: "Flipped Energy", aliases: ["Flipped"], electricity: NEM_ACT.slice(), gas: [], quoteUrl: "https://www.flippedenergy.com.au/", factor: [0.9, 0.95, 3.8] }),
    R({ id: "locality", name: "Locality Planning Energy", aliases: ["Locality Planning", "LPE"], electricity: NEM_ACT.slice(), gas: [], quoteUrl: "https://www.localityplanningenergy.com.au/", embedded: true, factor: [0.97, 1.04, 3], note: "Usually embedded networks and strata, not an open-market offer for every street address." })
  ];

  var PLAN_PATTERNS = [
    { retailerId: "agl", id: "essentials", label: "Essentials", variant: "market", patterns: [/essentials/i] },
    { retailerId: "agl", id: "value-saver", label: "Value Saver", variant: "lowusage", patterns: [/value saver/i] },
    { retailerId: "origin", id: "go", label: "Go", variant: "market", patterns: [/origin go\b/i, /\bgo plan\b/i] },
    { retailerId: "origin", id: "basic", label: "Basic", variant: "lowusage", patterns: [/origin basic/i] },
    { retailerId: "energyaustralia", id: "flexi", label: "Flexi Plan", variant: "market", patterns: [/flexi plan/i] },
    { retailerId: "energyaustralia", id: "total", label: "Total Plan", variant: "lowusage", patterns: [/total plan/i] },
    { retailerId: "engie", id: "engie-home", label: "ENGIE residential", variant: "market", patterns: [/engie home/i] },
    { retailerId: "simply", id: "simply-plus", label: "Simply Plus", variant: "market", patterns: [/simply plus/i] },
    { retailerId: "alinta", id: "home-deal", label: "Home Deal", variant: "market", patterns: [/home deal/i] },
    { retailerId: "red", id: "living", label: "Living Energy Saver", variant: "market", patterns: [/living energy/i] },
    { retailerId: "red", id: "qantas", label: "Qantas Red Saver", variant: "lowusage", patterns: [/qantas red/i] },
    { retailerId: "lumo", id: "lumo-basic", label: "Lumo Basic", variant: "market", patterns: [/lumo basic/i] },
    { retailerId: "momentum", id: "momentum-smile", label: "Smile", variant: "market", patterns: [/\bsmile\b/i] },
    { retailerId: "powershop", id: "powershop-top", label: "Top Shopper", variant: "market", patterns: [/top shopper/i] },
    { retailerId: "globird", id: "glohome", label: "GLOHOME", variant: "market", patterns: [/glohome/i, /glo home/i] },
    { retailerId: "globird", id: "fullhouse", label: "FULLHOUSE", variant: "lowusage", patterns: [/fullhouse/i, /full house/i] },
    { retailerId: "dodo", id: "dodo-resi", label: "Dodo residential", variant: "market", patterns: [/dodo residential/i] },
    { retailerId: "tango", id: "tango-home", label: "Home Plan", variant: "market", patterns: [/tango home/i] },
    { retailerId: "ovo", id: "ovo-simple", label: "Simple", variant: "market", patterns: [/ovo simple/i] },
    { retailerId: "kogan", id: "kogan-resi", label: "Kogan residential", variant: "market", patterns: [/kogan\s+energy/i] },
    { retailerId: "amber", id: "amber-home", label: "Amber wholesale", variant: "market", patterns: [/amber/i] },
    { retailerId: "first", id: "first-resi", label: "1st residential", variant: "market", patterns: [/1st residential/i, /first residential/i] },
    { retailerId: "diamond", id: "diamond-renewable", label: "Renewable", variant: "market", patterns: [/diamond renewable/i] },
    { retailerId: "synergy", id: "a1", label: "Home Plan (A1)", variant: "market", tariffs: ["single", "solar"], patterns: [/home plan\s*\(a1\)/i, /\bA1\b/] },
    { retailerId: "synergy", id: "midday", label: "Midday Saver", variant: "market", tariffs: ["tou-soak", "solar-soak"], patterns: [/midday saver/i] },
    { retailerId: "synergy", id: "b1", label: "Home Plan plus Hot Water (B1)", variant: "market", tariffs: ["controlled", "controlled-solar"], patterns: [/hot water plan\s*\(b1\)/i, /\bB1\b/] },
    { retailerId: "synergy", id: "l1", label: "Business Plan (L1)", variant: "market", tariffs: ["biz-single"], patterns: [/business plan\s*\(l1\)/i, /\bL1\b/] },
    { retailerId: "synergy", id: "r1", label: "Business Time of Use (R1)", variant: "market", tariffs: ["biz-two"], patterns: [/business time of use\s*\(r1\)/i, /\bR1\b/] },
    { retailerId: "aurora", id: "t32", label: "Residential Single Rate (Tariff 32)", variant: "market", tariffs: ["single", "solar"], patterns: [/tariff\s*32/i, /single rate/i] },
    { retailerId: "aurora", id: "t93", label: "Peak and Off-peak (Tariff 93)", variant: "market", tariffs: ["tou-two", "solar-two"], patterns: [/tariff\s*93/i] },
    { retailerId: "aurora", id: "t62", label: "Single rate plus night rate (Tariff 62)", variant: "market", tariffs: ["controlled", "controlled-solar"], patterns: [/tariff\s*62/i] },
    { retailerId: "jacana", id: "jacana-standard", label: "Standard Residential", variant: "market", tariffs: ["single", "solar"], patterns: [/standard residential/i] },
    { retailerId: "jacana", id: "jacana-tou", label: "Time of Use", variant: "market", tariffs: ["tou-two", "solar-two"], patterns: [/time of use/i] },
    { retailerId: "actewagl", id: "home", label: "Home", variant: "market", tariffs: ["single", "solar"], patterns: [/\bhome plan\b/i, /actewagl home\b/i] }
  ];

  function supplyField() {
    return { key: "supply", label: "Daily supply", unit: "c/day", per: "day", kind: "lower" };
  }
  function kwh(key, label, usageKey, windowKey) {
    return { key: key, label: label, unit: "c/kWh", per: "kwh", kind: "lower", usageKey: usageKey, windowKey: windowKey || null };
  }
  function fitField() {
    return { key: "fit", label: "Solar feed-in", unit: "c/kWh", per: "kwh", kind: "higher", usageKey: "exportKwh" };
  }
  function usageField(key, label, unit) {
    return { key: key, label: label, unit: unit };
  }
  function textField(key, label) {
    return { key: key, label: label, kind: "text" };
  }
  function yearField(key, label) {
    return { key: key, label: label, unit: "$/year", per: "year", kind: "lower", optional: true };
  }

  var businessExtras = [
    yearField("networkAnnual", "Extra network charge"),
    yearField("meteringAnnual", "Metering"),
    yearField("otherAnnual", "Other charges"),
    textField("contract", "Contract"),
    textField("termMonths", "Contract term (months)"),
    textField("exitNote", "Exit and benefits"),
    { key: "gstInclusive", label: "GST treatment", kind: "gst" }
  ];

  var clFields = [
    supplyField(),
    kwh("usage", "General usage", "generalKwh"),
    kwh("cl1", "Controlled load 1", "cl1Kwh"),
    Object.assign(kwh("cl2", "Controlled load 2", "cl2Kwh"), { optional: true }),
    { key: "clSupply", label: "Controlled load supply", unit: "c/day", per: "day", kind: "lower" }
  ];
  var clUsage = [
    usageField("generalKwh", "General usage", "kWh/year"),
    usageField("cl1Kwh", "Controlled load 1", "kWh/year"),
    usageField("cl2Kwh", "Controlled load 2", "kWh/year")
  ];

  function touFields(withFit) {
    var fields = [
      supplyField(),
      kwh("peak", "Peak", "peakKwh", "windowPeak"),
      kwh("shoulder", "Shoulder", "shoulderKwh", "windowShoulder"),
      kwh("offpeak", "Off-peak", "offpeakKwh", "windowOffpeak")
    ];
    if (withFit) fields.push(fitField());
    return fields;
  }
  function touUsage(withExport) {
    var u = [
      usageField("peakKwh", "Peak", "kWh/year"),
      usageField("shoulderKwh", "Shoulder", "kWh/year"),
      usageField("offpeakKwh", "Off-peak", "kWh/year")
    ];
    if (withExport) u.push(usageField("exportKwh", "Solar export", "kWh/year"));
    return u;
  }
  function twoFields(withFit) {
    var fields = [
      supplyField(),
      kwh("peak", "Peak", "peakKwh", "windowPeak"),
      kwh("offpeak", "Off-peak", "offpeakKwh", "windowOffpeak")
    ];
    if (withFit) fields.push(fitField());
    return fields;
  }
  function twoUsage(withExport) {
    var u = [
      usageField("peakKwh", "Peak", "kWh/year"),
      usageField("offpeakKwh", "Off-peak", "kWh/year")
    ];
    if (withExport) u.push(usageField("exportKwh", "Solar export", "kWh/year"));
    return u;
  }
  function soakFields(withFit) {
    var fields = [
      supplyField(),
      kwh("peak", "Peak", "peakKwh", "windowPeak"),
      kwh("soak", "Solar soak", "soakKwh", "windowSoak"),
      kwh("offpeak", "Off-peak", "offpeakKwh", "windowOffpeak")
    ];
    if (withFit) fields.push(fitField());
    return fields;
  }
  function soakUsage(withExport) {
    var u = [
      usageField("peakKwh", "Peak", "kWh/year"),
      usageField("soakKwh", "Solar soak", "kWh/year"),
      usageField("offpeakKwh", "Off-peak", "kWh/year")
    ];
    if (withExport) u.push(usageField("exportKwh", "Solar export", "kWh/year"));
    return u;
  }

  var TARIFFS = [
    { id: "single", label: "Single rate", group: "Residential electricity", fuel: "electricity", customer: "residential", fields: [supplyField(), kwh("usage", "General usage", "generalKwh")], usage: [usageField("generalKwh", "General usage", "kWh/year")] },
    { id: "demand-single", label: "Demand — single rate", group: "Residential electricity", fuel: "electricity", customer: "residential", fields: [supplyField(), kwh("usage", "General usage", "generalKwh"), { key: "demand", label: "Demand", unit: "c/kW/day", per: "kw-day", kind: "lower", usageKey: "demandKw" }], usage: [usageField("generalKwh", "General usage", "kWh/year"), usageField("demandKw", "Demand", "kW")] },
    { id: "tou", label: "Time of use — peak, shoulder, off-peak", group: "Residential electricity", fuel: "electricity", customer: "residential", fields: touFields(false), usage: touUsage(false) },
    { id: "tou-two", label: "Time of use — peak and off-peak", group: "Residential electricity", fuel: "electricity", customer: "residential", fields: twoFields(false), usage: twoUsage(false) },
    { id: "tou-soak", label: "Time of use — peak, solar soak, off-peak", group: "Residential electricity", fuel: "electricity", customer: "residential", fields: soakFields(false), usage: soakUsage(false) },
    { id: "controlled", label: "Controlled load", group: "Residential electricity", fuel: "electricity", customer: "residential", fields: clFields, usage: clUsage },
    { id: "solar", label: "Solar — single rate", group: "Residential electricity", fuel: "electricity", customer: "residential", fields: [supplyField(), kwh("usage", "General usage", "generalKwh"), fitField()], usage: [usageField("generalKwh", "General usage", "kWh/year"), usageField("exportKwh", "Solar export", "kWh/year")] },
    { id: "solar-tou", label: "Solar — peak, shoulder, off-peak", group: "Residential electricity", fuel: "electricity", customer: "residential", fields: touFields(true), usage: touUsage(true) },
    { id: "solar-two", label: "Solar — peak and off-peak", group: "Residential electricity", fuel: "electricity", customer: "residential", fields: twoFields(true), usage: twoUsage(true) },
    { id: "solar-soak", label: "Solar — peak, solar soak, off-peak", group: "Residential electricity", fuel: "electricity", customer: "residential", fields: soakFields(true), usage: soakUsage(true) },
    { id: "controlled-solar", label: "Controlled load and solar", group: "Residential electricity", fuel: "electricity", customer: "residential", fields: clFields.concat([fitField()]), usage: clUsage.concat([usageField("exportKwh", "Solar export", "kWh/year")]) },
    { id: "gas-single", label: "Single rate", group: "Residential gas", fuel: "gas", customer: "residential", fields: [supplyField(), { key: "gasUsage", label: "Gas usage", unit: "c/MJ", per: "mj", kind: "lower", usageKey: "gasMj" }], usage: [usageField("gasMj", "Gas usage", "MJ/year")] },
    { id: "gas-block", label: "Block rate", group: "Residential gas", fuel: "gas", customer: "residential", calc: "gas-block", fields: [supplyField(), { key: "block1", label: "Block 1 usage", unit: "c/MJ", per: "mj", kind: "lower" }, { key: "block1Limit", label: "Block 1 limit", unit: "MJ/day", kind: "limit" }, { key: "block2", label: "Block 2 usage", unit: "c/MJ", per: "mj", kind: "lower" }], usage: [usageField("gasMj", "Gas usage", "MJ/year")] },
    { id: "biz-single", label: "Single rate", group: "Business electricity", fuel: "electricity", customer: "business", fields: [supplyField(), kwh("usage", "General usage", "generalKwh")].concat(businessExtras), usage: [usageField("generalKwh", "General usage", "kWh/year")] },
    { id: "biz-demand-single", label: "Demand — single rate", group: "Business electricity", fuel: "electricity", customer: "business", fields: [supplyField(), kwh("usage", "General usage", "generalKwh"), { key: "demand", label: "Demand", unit: "c/kW/day", per: "kw-day", kind: "lower", usageKey: "demandKw" }].concat(businessExtras), usage: [usageField("generalKwh", "General usage", "kWh/year"), usageField("demandKw", "Demand", "kW")] },
    { id: "biz-tou", label: "Time of use — peak, shoulder, off-peak", group: "Business electricity", fuel: "electricity", customer: "business", fields: touFields(false).concat(businessExtras), usage: touUsage(false) },
    { id: "biz-two", label: "Time of use — peak and off-peak", group: "Business electricity", fuel: "electricity", customer: "business", fields: twoFields(false).concat(businessExtras), usage: twoUsage(false) },
    { id: "biz-demand", label: "Demand — peak, shoulder, off-peak", group: "Business electricity", fuel: "electricity", customer: "business", fields: touFields(false).concat([{ key: "demand", label: "Demand", unit: "$/kW/month", per: "kw-month", kind: "lower", usageKey: "demandKw" }]).concat(businessExtras), usage: touUsage(false).concat([usageField("demandKw", "Demand", "kW")]) },
    { id: "biz-gas", label: "Single rate", group: "Business gas", fuel: "gas", customer: "business", fields: [supplyField(), { key: "gasUsage", label: "Gas usage", unit: "c/MJ", per: "mj", kind: "lower", usageKey: "gasMj" }].concat(businessExtras), usage: [usageField("gasMj", "Gas usage", "MJ/year")] }
  ];

  var SPLITS = {
    tou: { peakKwh: 0.35, shoulderKwh: 0.4, offpeakKwh: 0.25 },
    "tou-two": { peakKwh: 0.3, offpeakKwh: 0.7 },
    "tou-soak": { peakKwh: 0.28, soakKwh: 0.22, offpeakKwh: 0.5 },
    "solar-tou": { peakKwh: 0.35, shoulderKwh: 0.4, offpeakKwh: 0.25 },
    "solar-two": { peakKwh: 0.3, offpeakKwh: 0.7 },
    "solar-soak": { peakKwh: 0.28, soakKwh: 0.22, offpeakKwh: 0.5 },
    "biz-tou": { peakKwh: 0.3, shoulderKwh: 0.45, offpeakKwh: 0.25 },
    "biz-two": { peakKwh: 0.55, offpeakKwh: 0.45 },
    "biz-demand": { peakKwh: 0.3, shoulderKwh: 0.45, offpeakKwh: 0.25 }
  };

  function tariffById(id) {
    for (var i = 0; i < TARIFFS.length; i++) if (TARIFFS[i].id === id) return TARIFFS[i];
    return null;
  }
  function tariffsFor(customer, fuel) {
    return TARIFFS.filter(function (t) { return t.customer === customer && t.fuel === fuel; });
  }
  function networkById(id) {
    for (var i = 0; i < NETWORKS.length; i++) if (NETWORKS[i].id === id) return NETWORKS[i];
    return null;
  }
  function networksFor(region) {
    return NETWORKS.filter(function (n) { return n.region === region; });
  }
  function retailerById(id) {
    for (var i = 0; i < RETAILERS.length; i++) if (RETAILERS[i].id === id) return RETAILERS[i];
    return null;
  }
  function defaultNetwork(region) {
    var map = { NSW: "ausgrid", VIC: "citipower", QLD: "energex", SA: "sapn", ACT: "evoenergy", TAS: "tasnetworks", WA: "westernpower", NT: "powerwater" };
    return map[region] || "";
  }
  function quoteUrlFor(retailer, customer) {
    if (!retailer) return "";
    if (customer === "business" && retailer.businessUrl) return retailer.businessUrl;
    return retailer.quoteUrl || "";
  }

  function suggestNsw(n) {
    if ((n >= 2500 && n <= 2530) || (n >= 2555 && n <= 2574) || (n >= 2745 && n <= 2787) || (n >= 2145 && n <= 2177)) return "endeavour";
    if ((n >= 2000 && n <= 2249) || (n >= 2250 && n <= 2339)) return "ausgrid";
    return "essential";
  }
  function suggestVic(n) {
    if (n >= 3000 && n <= 3207) return "citipower";
    if (n >= 3208 && n <= 3499) return "powercor";
    if (n >= 3500 && n <= 3749) return "ausnet";
    if (n >= 3750 && n <= 3810) return "jemena";
    if (n >= 3811 && n <= 3945) return "united";
    return "ausnet";
  }
  function suggestFromPostcode(pc) {
    var digits = String(pc || "").replace(/\D/g, "");
    if (digits.length !== 4) return null;
    var n = Number(digits);
    var hint = "Reference network is a suggestion from the postcode. Set the distributor printed on the bill before you rely on sample rates.";
    if (n >= 800 && n <= 899) return { region: "NT", network: "powerwater", hint: hint };
    if ((n >= 200 && n <= 299) || (n >= 2600 && n <= 2618) || (n >= 2900 && n <= 2920)) return { region: "ACT", network: "evoenergy", hint: hint };
    if (n >= 7000 && n <= 7999) return { region: "TAS", network: "tasnetworks", hint: hint };
    if (n >= 6000 && n <= 6999) return { region: "WA", network: "westernpower", hint: "Assumed Western Power (south-west). Regional Western Australia is often Horizon Power. Change the network if the bill says Horizon." };
    if (n >= 5000 && n <= 5999) return { region: "SA", network: "sapn", hint: hint };
    if (n >= 4000 && n <= 4999) {
      var ergon = n >= 4670;
      return { region: "QLD", network: ergon ? "ergon-net" : "energex", hint: ergon ? "Postcodes from 4670 up are often regional Queensland (Ergon). South-east Queensland is Energex. Correct this if the bill disagrees." : "Assumed Energex (south-east Queensland). Switch to Ergon if this is a regional account." };
    }
    if (n >= 3000 && n <= 3999) return { region: "VIC", network: suggestVic(n), hint: hint };
    if ((n >= 1000 && n <= 2599) || (n >= 2619 && n <= 2899) || (n >= 2921 && n <= 2999)) return { region: "NSW", network: suggestNsw(n), hint: hint };
    return null;
  }

  function serves(retailer, ctx) {
    if (!retailer || !ctx || !ctx.region || !ctx.fuel || !ctx.customer) return false;
    if (ctx.fuel === "electricity" && ctx.network === "ergon-net" && retailer.id !== "ergon") return false;
    if (ctx.fuel === "electricity" && ctx.network === "horizon-net" && retailer.id !== "horizon") return false;
    if (retailer.id === "ergon" && ctx.network && ctx.network !== "ergon-net") return false;
    if (retailer.id === "horizon" && ctx.network && ctx.network !== "horizon-net") return false;
    if (retailer.id === "synergy" && ctx.network === "horizon-net") return false;
    if (ctx.fuel === "electricity" && ctx.customer === "residential" && ctx.region === "WA" && ctx.network === "westernpower" && retailer.id !== "synergy") return false;
    var list = ctx.customer === "business"
      ? (ctx.fuel === "gas" ? retailer.businessGas : retailer.businessElectricity)
      : (ctx.fuel === "gas" ? retailer.gas : retailer.electricity);
    return list.indexOf(ctx.region) !== -1;
  }

  function whyNoPlan(retailerId, ctx) {
    var retailer = typeof retailerId === "string" ? retailerById(retailerId) : retailerId;
    if (!ctx.region) return "Choose a state before sample rates can load.";
    if (ctx.fuel === "electricity" && !ctx.network) return "Choose a reference network. Sample electricity rates differ by network.";
    if (!retailer) return "This retailer is not in the reference list. Enter the rates.";
    if (ctx.network === "ergon-net" && retailer.id !== "ergon") return "Ergon Energy is the only reference retailer on the regional Queensland network. Other retailers are not given sample rates here.";
    if (ctx.network === "horizon-net" && retailer.id !== "horizon") return "Horizon Power is the only reference retailer on its regional Western Australian network.";
    if (ctx.region === "WA" && ctx.fuel === "electricity" && ctx.customer === "residential" && ctx.network === "westernpower" && retailer.id !== "synergy") return "This reference set has Synergy for south-west residential electricity. Enter another retailer's rates yourself if you have them. The buyback scheme is regulated.";
    var fuelName = ctx.fuel === "gas" ? "gas" : "electricity";
    return retailer.name + " has no " + ctx.customer + " " + fuelName + " sample for " + (REGIONS[ctx.region] ? REGIONS[ctx.region].name : ctx.region) + " in this tool. Enter the rates, or pick a retailer from the ranked list.";
  }

  function familyFor(tariffId, customer) {
    if (tariffId === "single" || tariffId === "solar") return "flat";
    if (tariffId === "tou" || tariffId === "solar-tou") return "tou";
    if (tariffId === "tou-two" || tariffId === "solar-two") return "two";
    if (tariffId === "tou-soak" || tariffId === "solar-soak") return "soak";
    if (tariffId === "controlled" || tariffId === "controlled-solar") return "controlled";
    if (tariffId === "biz-single") return "businessFlat";
    if (tariffId === "biz-tou" || tariffId === "biz-demand") return "businessTou";
    if (tariffId === "biz-two") return "businessTwo";
    return null;
  }

  function synthesised(flat, family, region, customer) {
    var supply = flat.supply;
    var usage = flat.usage;
    var business = customer === "business" || family.indexOf("business") === 0;
    var note = business
      ? "Sample business time bands built from the flat business reference. Not a published time-of-use schedule, and not the same structure as a single-rate business plan."
      : "Sample peak, shoulder and off-peak shape built from the flat reference rate. It is not this network's published time-of-use cap, which may use different bands. Do not treat the two structures as the same tariff.";
    if (family === "tou" || family === "businessTou") {
      return {
        supply: r3(supply * (business ? 1.04 : 1.04)),
        peak: r3(usage * 1.72),
        shoulder: r3(usage * 1.02),
        offpeak: r3(usage * 0.64),
        quality: "synthesized",
        windows: preset("tou", region),
        note: note
      };
    }
    if (family === "two" || family === "businessTwo") {
      return {
        supply: r3(supply * 1.02),
        peak: r3(usage * 1.55),
        offpeak: r3(usage * 0.7),
        quality: "synthesized",
        windows: preset("two", region),
        note: "Sample peak and off-peak shape built from the flat reference rate. Use it only when the bill has those two bands and no shoulder or solar soak."
      };
    }
    if (family === "soak") {
      return {
        supply: supply,
        peak: r3(usage * 1.45),
        soak: r3(usage * 0.42),
        offpeak: r3(usage * 0.85),
        quality: "synthesized",
        windows: preset("soak", region),
        note: "Sample peak, solar-soak and off-peak shape built from the flat reference rate. It is not a published solar-soak tariff unless the note on a regulated network says so."
      };
    }
    return null;
  }

  function structureFor(network, tariffId, customer) {
    var family = familyFor(tariffId, customer);
    if (!family || !network) return null;
    if (network.structures && network.structures[family]) return network.structures[family];
    if (family === "controlled" && network.structures && network.structures.controlled) return network.structures.controlled;
    var flatPack = (family.indexOf("business") === 0) ? (network.businessFlat || null) : network.flat;
    if (!flatPack && family.indexOf("business") === 0 && network.flat) {
      flatPack = {
        supply: r3(network.flat.supply * 1.25),
        usage: r3(network.flat.usage * 0.95),
        note: "Sample business flat rate shaped from the residential reference (higher supply, slightly lower usage). Not a published business cap."
      };
    }
    if (!flatPack) return null;
    if (family === "flat" || family === "businessFlat") {
      var flatQuality = family === "flat" ? network.quality : (network.businessFlat ? network.quality : "sample");
      var flatNote = family === "businessFlat"
        ? (flatPack.note || "Sample business flat rate.")
        : (network.flatNote || "Flat reference rate for this network.");
      var flatLabel = family === "businessFlat" ? (flatPack.planLabel || "") : (network.flatPlanLabel || "");
      return { supply: flatPack.supply, usage: flatPack.usage, quality: flatQuality, note: flatNote, planLabel: flatLabel };
    }
    if (family === "controlled") {
      var cl = network.cl || { cl1: r3(flatPack.usage * 0.58), cl2: r3(flatPack.usage * 0.48), clSupply: 8.5, note: "Sample controlled-load rates." };
      var pack = {
        supply: flatPack.supply,
        usage: flatPack.usage,
        cl1: cl.cl1,
        clSupply: cl.clSupply == null ? 0 : cl.clSupply,
        quality: network.structures && network.structures.controlled ? "published-tariff" : "sample",
        note: (network.structures && network.structures.controlled && network.structures.controlled.note) || ((network.flatNote ? network.flatNote + " " : "") + (cl.note || "")),
        planLabel: (network.structures && network.structures.controlled && network.structures.controlled.planLabel) || ""
      };
      if (cl.cl2 != null) pack.cl2 = cl.cl2;
      if (network.structures && network.structures.controlled) {
        return network.structures.controlled;
      }
      pack.quality = "sample";
      return pack;
    }
    var made = synthesised(flatPack, family, network.region, customer);
    if (made && family.indexOf("business") === 0 && flatPack.note && !network.businessFlat) {
      made.note = flatPack.note + " " + made.note;
      made.quality = "sample";
    }
    return made;
  }

  function factorFor(retailer, ctx, variant) {
    var base = retailer.factor;
    if (retailer.publishedDirect && variant === "market") return { usage: 1, supply: 1, fit: base.fit };
    if (retailer.id === "actewagl" && ctx.region === "ACT" && variant === "market") return { usage: 1, supply: 1, fit: base.fit };
    if ((retailer.id === "ergon" || retailer.id === "horizon") && variant === "market") return { usage: 1, supply: 1, fit: base.fit };
    if (variant === "standing") return { usage: 1, supply: 1, fit: base.fit };
    if (variant === "lowusage") return { usage: r3(base.usage * 0.93), supply: r3(base.supply * 1.08), fit: r3(base.fit * 0.75) };
    return { usage: base.usage, supply: base.supply, fit: base.fit };
  }

  function scaleRates(structure, factor, direct) {
    var fU = direct ? 1 : factor.usage;
    var fS = direct ? 1 : factor.supply;
    var out = {};
    ["supply", "usage", "peak", "shoulder", "offpeak", "soak", "cl1", "cl2", "clSupply"].forEach(function (key) {
      if (structure[key] == null || typeof structure[key] !== "number") return;
      var f = (key === "supply" || key === "clSupply") ? fS : fU;
      out[key] = r3(structure[key] * f);
    });
    return out;
  }

  function vsCap(factor, noun) {
    var gap = Math.round(Math.abs(1 - factor) * 1000) / 10;
    if (Math.abs(1 - factor) < 0.005) return noun + " sits on the reference cap";
    if (factor < 1) return noun + " is about " + gap + "% under the reference cap";
    return noun + " is about " + gap + "% over the reference cap";
  }

  function basisNote(retailer, structure, factor, direct) {
    var bits = [];
    if (retailer.amber) bits.push("Amber moves with the wholesale price every half hour. This sample uses one annualised usage rate so it can sit beside a fixed rate. It is not an Amber bill forecast.");
    if (retailer.legacy) bits.push(retailer.note);
    if (retailer.embedded) bits.push(retailer.note);
    if (direct && structure.quality === "published-tariff") {
      bits.push(structure.note || "Published tariff reference.");
      bits.push("Checked " + VERIFIED_LABEL + ". Use it only when this is the customer's actual tariff.");
    } else if (structure.quality === "regulator-cap" && factor.usage === 1 && factor.supply === 1) {
      bits.push("Standing-offer shape set on the published 2026–27 default-offer cap for this network, GST inclusive. A cap, not " + retailer.name + "'s price.");
    } else if (structure.quality === "regulator-cap") {
      bits.push("Sample reference for " + retailer.name + ". " + vsCap(factor.usage, "Usage") + " and " + vsCap(factor.supply, "supply") + ". Scaled from the published 2026–27 default-offer cap for this network, GST inclusive. Not a live " + retailer.name + " offer.");
    } else if (structure.quality === "sample-aligned") {
      bits.push(structure.note || "Sample aligned to a published annual price.");
      if (!(factor.usage === 1 && factor.supply === 1)) bits.push(vsCap(factor.usage, "Usage") + " and " + vsCap(factor.supply, "supply") + " versus that reference split.");
    } else {
      bits.push(structure.note || "Sample reference, not a published cap and not a live offer.");
      if (!direct && !(factor.usage === 1 && factor.supply === 1)) bits.push(vsCap(factor.usage, "Usage") + " and " + vsCap(factor.supply, "supply") + " versus the sample base.");
    }
    if (structure.seasonal) bits.push(structure.seasonal);
    bits.push("Last verified " + VERIFIED_LABEL + ".");
    return bits.filter(Boolean).join(" ");
  }

  function contractFor(retailer, ctx) {
    if (ctx.customer === "business") {
      return {
        contract: "Sample 24-month business comparison. Confirm term, benefits and price-change rights on the quote.",
        termMonths: "24",
        exitNote: "Exit fees are not priced in the annual cost. Confirm the contract before you quote an exit."
      };
    }
    if (retailer.publishedDirect) {
      return {
        contract: "Regulated or standing offer reference. No retail exit fee in this reference.",
        termMonths: "None",
        exitNote: "No exit fee in this reference. Confirm the current terms."
      };
    }
    return {
      contract: "Ongoing reference. No fixed term and no exit fee in this sample.",
      termMonths: "None",
      exitNote: "No exit fee in this sample. Confirm the quote."
    };
  }

  function bundleName(retailer, variant, structure, choiceLabel) {
    if (choiceLabel) {
      var published = retailer.publishedDirect && structure.quality === "published-tariff";
      return published ? choiceLabel : choiceLabel + " — sample reference";
    }
    if (variant === "market" && structure.planLabel && (retailer.publishedDirect || structure.quality === "published-tariff")) return structure.planLabel;
    if (variant === "lowusage") return "Lower usage rate";
    if (variant === "standing") return "Standing-offer shape";
    return "Market reference";
  }

  function buildReferencePlan(retailerId, ctx, variant, choice) {
    var retailer = retailerById(retailerId);
    if (!retailer || !ctx) return null;
    if (!serves(retailer, ctx)) return null;
    variant = variant || "market";
    var tariff = tariffById(ctx.tariff);
    if (!tariff) return null;
    var factor = factorFor(retailer, ctx, variant);
    if (variant === "standing") factor = { usage: 1, supply: 1, fit: retailer.factor.fit };
    var rates = {};
    var windows = {};
    var structure = null;
    var note = "";

    if (ctx.fuel === "gas") {
      var region = REGIONS[ctx.region];
      if (!region || !region.gas) return null;
      var g = region.gas;
      var fU = factor.usage;
      var fS = factor.supply;
      if (ctx.tariff === "gas-block") {
        rates = { supply: r3(g.supply * fS), block1: r3(g.usage * fU * 1.12), block2: r3(g.usage * fU * 0.86), block1Limit: 50 };
      } else {
        rates = { supply: r3(g.supply * fS), gasUsage: r3(g.usage * fU) };
      }
      note = "Sample gas rates for " + region.name + ". " + vsCap(fU, "Usage") + " and " + vsCap(fS, "supply") + " versus the state sample base (" + g.supply.toFixed(2) + "c/day and " + g.usage.toFixed(2) + "c/MJ). Not a live tariff. Last verified " + VERIFIED_LABEL + ".";
      structure = { quality: "sample", windows: {} };
    } else {
      if (!ctx.network) return null;
      var network = networkById(ctx.network);
      if (!network) return null;
      structure = structureFor(network, ctx.tariff, ctx.customer);
      if (!structure) return null;
      var applied = factor;
      var keepPublished = retailer.publishedDirect && structure.quality === "published-tariff" && variant === "market";
      if (keepPublished || (retailer.id === "actewagl" && ctx.region === "ACT" && variant === "market")) {
        applied = { usage: 1, supply: 1, fit: factor.fit };
      }
      rates = scaleRates(structure, applied, false);
      var windowFamily = familyFor(ctx.tariff, ctx.customer);
      if (windowFamily === "businessTou") windowFamily = "tou";
      if (windowFamily === "businessTwo") windowFamily = "two";
      if (windowFamily !== "tou" && windowFamily !== "two" && windowFamily !== "soak") windowFamily = "tou";
      windows = Object.assign({}, structure.windows || preset(windowFamily, network.region));
      var needsFit = /solar/.test(ctx.tariff);
      if (needsFit) {
        var scale = FIT_SCALE[ctx.region] || 0;
        if (!scale || !applied.fit) {
          note += " No flat solar feed-in is included. Western Australia uses a regulated buyback rather than a retailer flat feed-in, and a blank feed-in is not treated as zero. Enter the customer's rate.";
        } else {
          rates.fit = r3(applied.fit * scale);
        }
      }
      if (ctx.tariff === "biz-demand") {
        rates.demand = r3((network.demand || 16) * applied.usage);
        note += " Demand is a sample $/kW/month, not a default-offer cap.";
      }
      note = basisNote(retailer, structure, applied, keepPublished) + note;
    }

    if (ctx.customer === "business" || ctx.tariff.indexOf("biz-") === 0) {
      rates.networkAnnual = 0;
      rates.meteringAnnual = 0;
      rates.otherAnnual = 0;
      note += " Extra network, metering and other charges are $0 in this sample, so they do not sit on top of supply and usage. Enter them if the bill lists them separately.";
    }

    var contracts = contractFor(retailer, ctx);
    var name = bundleName(retailer, variant, structure || {}, choice && choice.label);
    return {
      retailerId: retailer.id,
      retailerName: retailer.name,
      quoteUrl: quoteUrlFor(retailer, ctx.customer),
      variant: variant,
      planChoiceId: choice ? choice.id : "",
      planName: name,
      rates: rates,
      windows: windows,
      contract: contracts.contract,
      termMonths: contracts.termMonths,
      exitNote: contracts.exitNote,
      note: note.replace(/\s+/g, " ").trim(),
      verified: VERIFIED_ISO,
      amber: retailer.amber,
      legacy: retailer.legacy
    };
  }

  function planChoices(retailer, tariffId) {
    if (!retailer) return [];
    var named = PLAN_PATTERNS.filter(function (p) {
      if (p.retailerId !== retailer.id) return false;
      if (!p.tariffs || p.tariffs.indexOf("*") !== -1) return true;
      return p.tariffs.indexOf(tariffId) !== -1;
    });
    var choices = named.map(function (p) {
      return { id: p.id, label: p.label, variant: p.variant, retailerId: p.retailerId };
    });
    if (retailer.publishedDirect) {
      if (!choices.length) choices.push({ id: "market", label: "Published reference", variant: "market", retailerId: retailer.id });
      return choices;
    }
    if (!choices.some(function (c) { return c.variant === "market"; })) {
      choices.unshift({ id: "market", label: "Market reference", variant: "market", retailerId: retailer.id });
    }
    if (!choices.some(function (c) { return c.variant === "lowusage"; })) {
      choices.push({ id: "lowusage", label: "Lower usage rate", variant: "lowusage", retailerId: retailer.id });
    }
    if (!choices.some(function (c) { return c.variant === "standing"; })) {
      choices.push({ id: "standing", label: "Standing-offer shape", variant: "standing", retailerId: retailer.id });
    }
    return choices;
  }

  function matchPlan(text, retailerId) {
    if (!text) return null;
    var best = null;
    PLAN_PATTERNS.forEach(function (p) {
      if (retailerId && p.retailerId !== retailerId) return;
      p.patterns.forEach(function (re) {
        if (re.test(text)) {
          if (!best || p.label.length > best.label.length) best = { id: p.id, label: p.label, variant: p.variant, retailerId: p.retailerId };
        }
      });
    });
    return best;
  }

  function rankVariants(retailer, ctx) {
    if (!retailer) return [];
    if (retailer.publishedDirect) return ["market"];
    if (retailer.id === "actewagl" && ctx.region === "ACT") return ["market"];
    if (retailer.id === "ergon" || retailer.id === "horizon") return ["market"];
    return ["market", "lowusage"];
  }

  function defaultUsage(ctx, key) {
    var region = REGIONS[ctx.region] || null;
    var network = networkById(ctx.network);
    function kwhTotal() {
      if (ctx.customer === "business") {
        if (network) return { value: network.businessKwh, note: network.businessNote };
        return { value: 10000, note: "No network selected. 10,000 kWh/year is the small-business benchmark used with the 2026–27 default offer, used here only as a placeholder." };
      }
      if (network) return { value: network.annualKwh, note: network.annualNote };
      return { value: 4000, note: "No network selected. 4,000 kWh/year is a placeholder so the page can show a shape. Choose the network on the bill." };
    }
    if (key === "generalKwh") return kwhTotal();
    if (key === "cl1Kwh") {
      if (network) return { value: network.clKwh, note: network.clNote };
      return { value: 1800, note: "Controlled load 1 assumed at 1,800 kWh/year until a network is chosen." };
    }
    if (key === "cl2Kwh") return { value: 0, note: "Controlled load 2 assumed at 0 kWh. Enter it if the bill has a second controlled load." };
    if (key === "exportKwh") {
      if (region) return { value: region.exportKwh, note: region.exportNote };
      return { value: 3000, note: "Solar export assumed at 3,000 kWh/year. Not from the bill." };
    }
    if (key === "gasMj") {
      if (region && region.gas) return { value: region.gasMj, note: region.gasNote };
      return { value: 20000, note: "Gas use assumed at 20,000 MJ/year. Replace it with the bill." };
    }
    if (key === "demandKw") return { value: 15, note: "Demand assumed at 15 kW, a small-business placeholder. Replace it with the billed or contracted demand." };
    var split = SPLITS[ctx.tariff] && SPLITS[ctx.tariff][key];
    if (split) {
      var base = kwhTotal();
      var value = Math.round(base.value * split);
      var band = key.replace("Kwh", "");
      return { value: value, note: band.charAt(0).toUpperCase() + band.slice(1) + " assumed as " + Math.round(split * 100) + "% of " + base.value.toLocaleString("en-AU") + " kWh/year. " + base.note };
    }
    return { value: 0, note: "No reference usage for this field. Treated as 0 until you enter it." };
  }

  function comparatorFor(region) {
    if (region === "VIC") return { name: "Victorian Energy Compare", url: "https://compare.energy.vic.gov.au/" };
    if (region === "NSW" || region === "QLD" || region === "SA") return { name: "Energy Made Easy", url: "https://www.energymadeeasy.gov.au/" };
    return null;
  }

  // Orange name = ours. Green name and a green View button = selling today.
  var OURS = ["dodo", "bluenrg", "first", "nextbusiness", "momentum", "alinta", "engie", "agl"];
  var SELLING = [];

  function tableMark(id) {
    var ours = OURS.indexOf(id) !== -1;
    var sell = SELLING.indexOf(id) !== -1;
    if (ours && sell) return "both";
    if (sell) return "sell";
    if (ours) return "ours";
    return "";
  }

  function networkOffer(network, tariffId, customer) {
    var family = familyFor(tariffId, customer);
    if (!family || !network) return false;
    if (family === "flat") return !!network.flat;
    if (family === "businessFlat") return !!network.businessFlat;
    if (family === "controlled") return !!(network.structures && network.structures.controlled) || !!(network.cl && network.cl.cl1 != null);
    if (tariffId === "biz-demand") return !!(network.structures && (network.structures.demand || network.structures.businessDemand));
    return !!(network.structures && network.structures[family]);
  }

  function tariffsAvailable(ctx) {
    if (!ctx) return [];
    return tariffsFor(ctx.customer, ctx.fuel).filter(function (tariff) {
      if (ctx.fuel === "gas") return !!(REGIONS[ctx.region] && REGIONS[ctx.region].gas);
      return !!networkById(ctx.network);
    });
  }

  function demandRate(retailer, ctx) {
    var network = networkById(ctx && ctx.network);
    if (!network || network.demand == null) return null;
    var usageFactor = retailer && retailer.factor && retailer.factor.usage ? retailer.factor.usage : 1;
    return r3(network.demand * usageFactor);
  }

  function offerExists(retailer, ctx) {
    if (!retailer || !ctx || !serves(retailer, ctx)) return false;
    if (ctx.fuel === "gas") return !!(REGIONS[ctx.region] && REGIONS[ctx.region].gas);
    if (!networkById(ctx.network)) return false;
    if (retailer.publishedDirect) {
      var named = PLAN_PATTERNS.some(function (pattern) {
        return pattern.retailerId === retailer.id && pattern.tariffs && pattern.tariffs.indexOf(ctx.tariff) !== -1;
      });
      if (named) return true;
      var family = familyFor(ctx.tariff, ctx.customer);
      if (family === "flat" || family === "businessFlat") return networkOffer(networkById(ctx.network), ctx.tariff, ctx.customer);
      var structure = networkById(ctx.network).structures && networkById(ctx.network).structures[family];
      return !!(structure && structure.quality === "published-tariff");
    }
    return true;
  }

  function searchRetailers(query) {
    var q = String(query || "").trim().toLowerCase();
    var list = RETAILERS.slice();
    if (!q) return list;
    return list.filter(function (r) {
      var hay = [r.name].concat(r.aliases).join(" ").toLowerCase();
      return q.split(/\s+/).every(function (part) { return hay.indexOf(part) !== -1; });
    }).sort(function (a, b) {
      var as = a.name.toLowerCase().indexOf(q) === 0 ? 0 : 1;
      var bs = b.name.toLowerCase().indexOf(q) === 0 ? 0 : 1;
      if (as !== bs) return as - bs;
      return a.name.localeCompare(b.name);
    });
  }

  root.QCData = {
    VERIFIED_ISO: VERIFIED_ISO,
    VERIFIED_LABEL: VERIFIED_LABEL,
    DISCLAIMER: DISCLAIMER,
    REGIONS: REGIONS,
    NETWORKS: NETWORKS,
    RETAILERS: RETAILERS,
    TARIFFS: TARIFFS,
    tariffById: tariffById,
    tariffsFor: tariffsFor,
    networkById: networkById,
    networksFor: networksFor,
    retailerById: retailerById,
    defaultNetwork: defaultNetwork,
    suggestFromPostcode: suggestFromPostcode,
    serves: serves,
    whyNoPlan: whyNoPlan,
    quoteUrlFor: quoteUrlFor,
    buildReferencePlan: buildReferencePlan,
    planChoices: planChoices,
    matchPlan: matchPlan,
    rankVariants: rankVariants,
    defaultUsage: defaultUsage,
    comparatorFor: comparatorFor,
    searchRetailers: searchRetailers,
    OURS: OURS,
    SELLING: SELLING,
    tableMark: tableMark,
    networkOffer: networkOffer,
    tariffsAvailable: tariffsAvailable,
    offerExists: offerExists,
    demandRate: demandRate,
    FIT_SCALE: FIT_SCALE
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
