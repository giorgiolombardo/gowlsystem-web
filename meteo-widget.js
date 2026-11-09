/**
 * gOWLsystem-web — Finestre Operative (Meteo-VRA)
 * Live + fasce orarie + profilo verticale vento 0–120 m + storico/forecast.
 */
(function () {
  "use strict";

  var DEFAULT = { lat: 45.6983, lon: 9.6773, label: "Bergamo (default)" };
  var PROFILE_HEIGHTS = [0, 20, 40, 60, 80, 100, 120];
  var VINEYARD_Z0 = 0.2; // scabrosità tipica vigneto (m)
  var BANDS = [
    { id: "notte", label: "Notte", from: 0, to: 6 },
    { id: "mattina", label: "Mattina", from: 6, to: 12 },
    { id: "pomeriggio", label: "Pomeriggio", from: 12, to: 18 },
    { id: "sera", label: "Sera", from: 18, to: 24 },
  ];

  var state = {
    lat: DEFAULT.lat,
    lon: DEFAULT.lon,
    label: DEFAULT.label,
    parcelName: "",
    selectedDay: "",
    hourly: null,
    dailyDates: [],
  };

  var el = {
    title: document.getElementById("meteo-title"),
    place: document.getElementById("meteo-place"),
    search: document.getElementById("meteo-search"),
    searchBtn: document.getElementById("meteo-search-btn"),
    geoBtn: document.getElementById("meteo-geo-btn"),
    geojson: document.getElementById("meteo-geojson"),
    temp: document.getElementById("meteo-temp"),
    wind: document.getElementById("meteo-wind"),
    hum: document.getElementById("meteo-hum"),
    status: document.getElementById("meteo-status"),
    histBody: document.getElementById("meteo-history-body"),
    fcBody: document.getElementById("meteo-forecast-body"),
    daySelect: document.getElementById("meteo-day-select"),
    hourlyBands: document.getElementById("meteo-hourly-bands"),
    profileFocus: document.getElementById("meteo-profile-focus"),
    profileMeta: document.getElementById("meteo-profile-meta"),
    profileChart: document.getElementById("meteo-profile-chart"),
  };

  if (!el.temp || !el.status) return;

  function setPlace() {
    var name = state.parcelName
      ? state.parcelName + " · " + state.label
      : state.label;
    if (el.place) {
      el.place.textContent =
        "Località: " + name + " (" + state.lat.toFixed(4) + ", " + state.lon.toFixed(4) + ")";
    }
    if (el.title) {
      el.title.textContent = state.parcelName
        ? "Finestre Operative · " + state.parcelName
        : "Finestre Operative & Forecast";
    }
  }

  function parseCoords(raw) {
    var m = String(raw || "").trim().match(
      /^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/
    );
    if (!m) return null;
    var lat = parseFloat(m[1]);
    var lon = parseFloat(m[2]);
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return { lat: lat, lon: lon };
  }

  function centroidOfCoords(coords) {
    var sumLat = 0, sumLon = 0, n = 0;
    function walk(c) {
      if (!Array.isArray(c) || !c.length) return;
      if (typeof c[0] === "number" && typeof c[1] === "number") {
        sumLon += c[0];
        sumLat += c[1];
        n += 1;
        return;
      }
      for (var i = 0; i < c.length; i++) walk(c[i]);
    }
    walk(coords);
    if (!n) return null;
    return { lon: sumLon / n, lat: sumLat / n };
  }

  function featureCentroid(feature) {
    if (!feature || !feature.geometry) return null;
    var g = feature.geometry;
    if (g.type === "Point") {
      return { lon: g.coordinates[0], lat: g.coordinates[1] };
    }
    return centroidOfCoords(g.coordinates);
  }

  function parcelNameFromProps(props) {
    if (!props || typeof props !== "object") return "Appezzamento";
    return (
      props.name ||
      props.nome ||
      props.Name ||
      props.label ||
      props.id ||
      props.appezzamento ||
      "Appezzamento"
    );
  }

  function applyParcel(geojson, explicitName) {
    var fc = geojson;
    if (fc && fc.type === "Feature") fc = { type: "FeatureCollection", features: [fc] };
    if (!fc || !fc.features || !fc.features.length) throw new Error("GeoJSON senza features");
    var f = fc.features[0];
    var c = featureCentroid(f);
    if (!c) throw new Error("Baricentro non calcolabile");
    state.lat = c.lat;
    state.lon = c.lon;
    state.parcelName = explicitName || parcelNameFromProps(f.properties);
    state.label = "baricentro appezzamento";
    setPlace();
    return loadForecast();
  }

  async function geocode(query) {
    var coords = parseCoords(query);
    if (coords) {
      state.lat = coords.lat;
      state.lon = coords.lon;
      state.label = coords.lat.toFixed(4) + ", " + coords.lon.toFixed(4);
      state.parcelName = "";
      setPlace();
      return loadForecast();
    }
    var url =
      "https://geocoding-api.open-meteo.com/v1/search?name=" +
      encodeURIComponent(query) +
      "&count=1&language=it&format=json";
    var res = await fetch(url);
    var data = await res.json();
    if (!data.results || !data.results.length) throw new Error("Località non trovata");
    var r = data.results[0];
    state.lat = r.latitude;
    state.lon = r.longitude;
    state.label = [r.name, r.admin1, r.country].filter(Boolean).join(", ");
    state.parcelName = "";
    setPlace();
    return loadForecast();
  }

  function useGeolocation() {
    return new Promise(function (resolve) {
      if (!navigator.geolocation) {
        resolve(false);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          state.lat = pos.coords.latitude;
          state.lon = pos.coords.longitude;
          state.label = "posizione GPS";
          state.parcelName = "";
          setPlace();
          loadForecast()
            .then(function () { resolve(true); })
            .catch(function () { resolve(true); });
        },
        function () { resolve(false); },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      );
    });
  }

  function soilHint(rainMm) {
    if (rainMm >= 10) return "Bagnato / rischio dilavamento";
    if (rainMm >= 2) return "Umidità residua";
    return "Terreno asciutto";
  }

  function windowHint(windMax, rainMm) {
    if (windMax >= 15) return { text: "CHIUSA · deriva", cls: "bad" };
    if (rainMm >= 5) return { text: "SCONSIGLIATA · pioggia", cls: "warn" };
    if (windMax >= 10) return { text: "ATTENZIONE · vento", cls: "warn" };
    return { text: "APERTA · ottimale", cls: "ok" };
  }

  /** Semaforo agronomico tassativo (vento 10 m + UR). */
  function evaluateSemaforo(windSpeed, humidity) {
    var wind = Number(windSpeed);
    var hum = Number(humidity);
    if (wind >= 15) {
      return { cls: "bad", short: "ROSSO", text: "VENTO FORTE (RISCHIO DERIVA)" };
    }
    if (hum > 85) {
      return { cls: "bad", short: "ROSSO", text: "UMIDITÀ ECCESSIVA (RISCHIO DILAVAMENTO)" };
    }
    if (hum < 50) {
      return { cls: "warn", short: "GIALLO", text: "ARIA SECCA (RISCHIO EVAPORAZIONE)" };
    }
    if (hum >= 75 && hum <= 85) {
      return { cls: "warn", short: "GIALLO", text: "UMIDITÀ ALTA (CONDIZIONE LIMITE)" };
    }
    return { cls: "ok", short: "VERDE", text: "OTTIMO (FINESTRA APERTA)" };
  }

  function setLiveStatus(windSpeed, humidity) {
    var statusEl = el.status;
    if (!statusEl) return;
    var s = evaluateSemaforo(windSpeed, humidity);
    var classMap = {
      bad: "text-xs font-bold text-red-300 bg-red-900 px-2 py-1 rounded inline-block mt-1",
      warn: "text-xs font-bold text-amber-200 bg-amber-900 px-2 py-1 rounded inline-block mt-1",
      ok: "text-xs font-bold text-emerald-300 bg-emerald-900 px-2 py-1 rounded inline-block mt-1",
    };
    statusEl.innerText = s.text;
    statusEl.className = classMap[s.cls];
  }

  function fmtDay(iso) {
    try {
      var d = new Date(iso + "T12:00:00");
      return d.toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "short" });
    } catch (e) {
      return iso;
    }
  }

  function fmtHour(iso) {
    try {
      var d = new Date(iso);
      return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    } catch (e) {
      return iso.slice(11, 16);
    }
  }

  /** Profilo logaritmico da riferimento 10 m (scabrosità vigneto). */
  function logWindFrom10(z, u10) {
    if (z <= 0) return 0;
    if (!(u10 > 0)) return 0;
    var zEff = Math.max(z, VINEYARD_Z0 * 1.01);
    return u10 * (Math.log(zEff / VINEYARD_Z0) / Math.log(10 / VINEYARD_Z0));
  }

  /**
   * Profilo 0–120 m: ancore Open-Meteo (10/80/120) + interpolazione log
   * e riempimento logaritmico vigneto dove manca il dato.
   */
  function buildWindProfile(u10, u80, u120) {
    var u10n = Number(u10) || 0;
    var anchors = [
      { z: 0, u: 0 },
      { z: 10, u: u10n },
      {
        z: 80,
        u: u80 != null && !isNaN(Number(u80)) ? Number(u80) : logWindFrom10(80, u10n),
      },
      {
        z: 120,
        u: u120 != null && !isNaN(Number(u120)) ? Number(u120) : logWindFrom10(120, u10n),
      },
    ];

    function interpLog(z) {
      if (z <= 0) return 0;
      for (var i = 0; i < anchors.length - 1; i++) {
        var a = anchors[i];
        var b = anchors[i + 1];
        if (z >= a.z && z <= b.z) {
          if (a.z <= 0) {
            var t = z / b.z;
            return a.u + (b.u - a.u) * t;
          }
          var lnA = Math.log(Math.max(a.z, VINEYARD_Z0));
          var lnB = Math.log(Math.max(b.z, VINEYARD_Z0));
          var lnZ = Math.log(Math.max(z, VINEYARD_Z0));
          var w = (lnZ - lnA) / (lnB - lnA || 1);
          return a.u + (b.u - a.u) * w;
        }
      }
      return logWindFrom10(z, u10n);
    }

    return PROFILE_HEIGHTS.map(function (z) {
      return { z: z, wind: Math.max(0, interpLog(z)) };
    });
  }

  function renderHistory(daily, todayIdx) {
    var rows = [];
    var start = Math.max(0, todayIdx - 3);
    for (var i = start; i < todayIdx; i++) {
      var rain = daily.precipitation_sum[i];
      var wind = daily.wind_speed_10m_max[i];
      rows.push(
        "<tr>" +
          "<td class='py-2 pr-2 text-white'>" + fmtDay(daily.time[i]) + "</td>" +
          "<td class='py-2 pr-2'>" + (rain != null ? rain.toFixed(1) + " mm" : "—") + "</td>" +
          "<td class='py-2 pr-2'>" + (wind != null ? wind.toFixed(1) + " km/h" : "—") + "</td>" +
          "<td class='py-2 text-gray-300'>" + soilHint(rain || 0) + "</td>" +
        "</tr>"
      );
    }
    if (el.histBody) {
      el.histBody.innerHTML = rows.length
        ? rows.join("")
        : "<tr><td class='py-2 text-gray-500' colspan='4'>Nessun dato storico</td></tr>";
    }
  }

  function renderForecast(daily, todayIdx) {
    var rows = [];
    var end = Math.min(daily.time.length, todayIdx + 7);
    for (var i = todayIdx; i < end; i++) {
      var rain = daily.precipitation_sum[i] || 0;
      var wind = daily.wind_speed_10m_max[i] || 0;
      var tmin = daily.temperature_2m_min[i];
      var tmax = daily.temperature_2m_max[i];
      var day = daily.time[i];
      var w = windowHint(wind, rain);
      rows.push(
        "<tr class='meteo-fc-row' data-day='" + day + "'>" +
          "<td class='py-2 pr-2 text-white'>" +
            "<button type='button' class='meteo-day-link' data-day='" + day + "'>" +
            fmtDay(day) +
            "</button>" +
          "</td>" +
          "<td class='py-2 pr-2'>" +
            (tmin != null && tmax != null ? tmin.toFixed(0) + "° / " + tmax.toFixed(0) + "°" : "—") +
          "</td>" +
          "<td class='py-2 pr-2'>" + rain.toFixed(1) + " mm</td>" +
          "<td class='py-2 pr-2'>" + wind.toFixed(1) + " km/h</td>" +
          "<td class='py-2'><span class='meteo-badge " + w.cls + "'>" + w.text + "</span></td>" +
        "</tr>"
      );
    }
    if (el.fcBody) el.fcBody.innerHTML = rows.join("");
  }

  function hoursForDay(dayIso) {
    var hourly = state.hourly;
    if (!hourly || !hourly.time) return [];
    var out = [];
    for (var i = 0; i < hourly.time.length; i++) {
      if (hourly.time[i].slice(0, 10) !== dayIso) continue;
      var u10 = hourly.wind_speed_10m[i];
      var hum = hourly.relative_humidity_2m[i];
      var profile = buildWindProfile(
        u10,
        hourly.wind_speed_80m ? hourly.wind_speed_80m[i] : null,
        hourly.wind_speed_120m ? hourly.wind_speed_120m[i] : null
      );
      var sem = evaluateSemaforo(u10, hum);
      out.push({
        time: hourly.time[i],
        hour: Number(hourly.time[i].slice(11, 13)),
        temp: hourly.temperature_2m ? hourly.temperature_2m[i] : null,
        humidity: hum,
        wind10: u10,
        rain: hourly.precipitation ? hourly.precipitation[i] : 0,
        profile: profile,
        sem: sem,
      });
    }
    return out;
  }

  function renderProfileChart(slot) {
    if (!el.profileChart || !el.profileFocus || !el.profileMeta) return;
    if (!slot) {
      el.profileFocus.hidden = true;
      return;
    }
    el.profileFocus.hidden = false;
    el.profileMeta.textContent =
      fmtDay(slot.time.slice(0, 10)) +
      " · " +
      fmtHour(slot.time) +
      " · UR " +
      (slot.humidity != null ? slot.humidity.toFixed(0) + "%" : "—") +
      " · V10 " +
      (slot.wind10 != null ? slot.wind10.toFixed(1) + " km/h" : "—") +
      " · " +
      slot.sem.text;

    var maxU = 1;
    slot.profile.forEach(function (p) {
      if (p.wind > maxU) maxU = p.wind;
    });
    // show from top (120m) to ground
    var rows = slot.profile
      .slice()
      .reverse()
      .map(function (p) {
        var pct = Math.min(100, (p.wind / maxU) * 100);
        var tone =
          p.wind >= 15 ? "is-bad" : p.wind >= 10 ? "is-warn" : "is-ok";
        return (
          "<div class='meteo-profile-row'>" +
            "<span class='meteo-profile-z'>" + p.z + " m</span>" +
            "<div class='meteo-profile-bar-track'>" +
              "<div class='meteo-profile-bar " + tone + "' style='width:" + pct.toFixed(1) + "%'></div>" +
            "</div>" +
            "<span class='meteo-profile-u'>" + p.wind.toFixed(1) + " km/h</span>" +
          "</div>"
        );
      });
    el.profileChart.innerHTML = rows.join("");
  }

  function renderHourlyBands() {
    if (!el.hourlyBands) return;
    var day = state.selectedDay;
    var slots = hoursForDay(day);
    if (!slots.length) {
      el.hourlyBands.innerHTML =
        "<p class='text-sm text-gray-500'>Nessuna fascia oraria per " + (day || "—") + "</p>";
      renderProfileChart(null);
      return;
    }

    var html = "";
    BANDS.forEach(function (band) {
      var inBand = slots.filter(function (s) {
        return s.hour >= band.from && s.hour < band.to;
      });
      if (!inBand.length) return;

      var worst = "ok";
      inBand.forEach(function (s) {
        if (s.sem.cls === "bad") worst = "bad";
        else if (s.sem.cls === "warn" && worst !== "bad") worst = "warn";
      });

      html +=
        "<details class='meteo-band' data-band='" + band.id + "'>" +
          "<summary class='meteo-band-summary'>" +
            "<span class='meteo-band-label'>" + band.label +
            " <small>(" + String(band.from).padStart(2, "0") +
            ":00–" + String(band.to).padStart(2, "0") + ":00)</small></span>" +
            "<span class='meteo-badge " + worst + "'>" +
              (worst === "ok" ? "VERDE" : worst === "warn" ? "GIALLO" : "ROSSO") +
            "</span>" +
          "</summary>" +
          "<div class='meteo-hour-list'>";

      inBand.forEach(function (s) {
        html +=
          "<button type='button' class='meteo-hour-card' data-time='" + s.time + "'>" +
            "<div class='meteo-hour-top'>" +
              "<strong>" + fmtHour(s.time) + "</strong>" +
              "<span class='meteo-badge " + s.sem.cls + "'>" + s.sem.short + "</span>" +
            "</div>" +
            "<div class='meteo-hour-metrics'>" +
              "<span>UR <b>" + (s.humidity != null ? s.humidity.toFixed(0) : "—") + "%</b></span>" +
              "<span>V10 <b>" + (s.wind10 != null ? s.wind10.toFixed(1) : "—") + " km/h</b></span>" +
              "<span>T <b>" + (s.temp != null ? s.temp.toFixed(1) + "°" : "—") + "</b></span>" +
            "</div>" +
            "<p class='meteo-hour-status'>" + s.sem.text + "</p>" +
            "<div class='meteo-mini-profile' aria-hidden='true'>" +
              s.profile
                .map(function (p) {
                  var h = Math.max(4, Math.min(100, p.wind * 4));
                  return (
                    "<span class='meteo-mini-col' title='" +
                    p.z +
                    " m: " +
                    p.wind.toFixed(1) +
                    " km/h'><i style='height:" +
                    h +
                    "%'></i><em>" +
                    p.z +
                    "</em></span>"
                  );
                })
                .join("") +
            "</div>" +
          "</button>";
      });

      html += "</div></details>";
    });

    el.hourlyBands.innerHTML = html;

    // default focus: current hour if today, else first slot
    var focus = slots[0];
    var now = new Date();
    var todayIso =
      now.getFullYear() +
      "-" +
      String(now.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(now.getDate()).padStart(2, "0");
    if (day === todayIso) {
      var hNow = now.getHours();
      for (var i = 0; i < slots.length; i++) {
        if (slots[i].hour === hNow) {
          focus = slots[i];
          break;
        }
      }
    }
    renderProfileChart(focus);

    el.hourlyBands.querySelectorAll(".meteo-hour-card").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var t = btn.getAttribute("data-time");
        var found = null;
        for (var j = 0; j < slots.length; j++) {
          if (slots[j].time === t) {
            found = slots[j];
            break;
          }
        }
        el.hourlyBands.querySelectorAll(".meteo-hour-card").forEach(function (b) {
          b.classList.toggle("is-active", b === btn);
        });
        renderProfileChart(found);
      });
    });

    // open band containing focus
    var focusBand = BANDS.find(function (b) {
      return focus.hour >= b.from && focus.hour < b.to;
    });
    if (focusBand) {
      var det = el.hourlyBands.querySelector(
        'details[data-band="' + focusBand.id + '"]'
      );
      if (det) det.open = true;
    }
  }

  function populateDaySelect(dates, preferred) {
    if (!el.daySelect) return;
    el.daySelect.innerHTML = dates
      .map(function (d) {
        return (
          "<option value='" +
          d +
          "'" +
          (d === preferred ? " selected" : "") +
          ">" +
          fmtDay(d) +
          " (" +
          d +
          ")</option>"
        );
      })
      .join("");
  }

  function selectDay(dayIso, switchTab) {
    if (!dayIso) return;
    state.selectedDay = dayIso;
    if (el.daySelect && el.daySelect.value !== dayIso) {
      el.daySelect.value = dayIso;
    }
    renderHourlyBands();
    if (switchTab) activateTab("hourly");
  }

  function activateTab(tab) {
    var tabs = document.querySelectorAll("#finestre-operative .meteo-tab");
    tabs.forEach(function (b) {
      var on = b.getAttribute("data-tab") === tab;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    ["live", "hourly", "history", "forecast"].forEach(function (id) {
      var panel = document.getElementById("meteo-panel-" + id);
      if (!panel) return;
      var on = id === tab;
      panel.hidden = !on;
      panel.classList.toggle("is-active", on);
    });
  }

  async function loadForecast() {
    setPlace();
    var url =
      "https://api.open-meteo.com/v1/forecast?" +
      "latitude=" + encodeURIComponent(state.lat) +
      "&longitude=" + encodeURIComponent(state.lon) +
      "&current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation" +
      "&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_speed_80m,wind_speed_120m,precipitation" +
      "&daily=precipitation_sum,wind_speed_10m_max,temperature_2m_max,temperature_2m_min" +
      "&past_days=3&forecast_days=7&timezone=auto";
    var res = await fetch(url);
    var data = await res.json();
    if (!data || !data.current) throw new Error("Risposta meteo non valida");

    el.temp.innerText = data.current.temperature_2m + " °C";
    el.wind.innerText = data.current.wind_speed_10m + " km/h";
    el.hum.innerText = data.current.relative_humidity_2m + " %";
    setLiveStatus(data.current.wind_speed_10m, data.current.relative_humidity_2m);

    state.hourly = data.hourly || null;

    var daily = data.daily;
    if (!daily || !daily.time) return;

    var today = (data.current.time || "").slice(0, 10);
    var todayIdx = daily.time.indexOf(today);
    if (todayIdx < 0) todayIdx = Math.min(3, daily.time.length - 1);

    state.dailyDates = daily.time.slice();
    var preferred = state.selectedDay && state.dailyDates.indexOf(state.selectedDay) >= 0
      ? state.selectedDay
      : daily.time[todayIdx];
    populateDaySelect(state.dailyDates, preferred);
    state.selectedDay = preferred;

    renderHistory(daily, todayIdx);
    renderForecast(daily, todayIdx);
    renderHourlyBands();
  }

  function bindTabs() {
    var tabs = document.querySelectorAll("#finestre-operative .meteo-tab");
    tabs.forEach(function (btn) {
      btn.addEventListener("click", function () {
        activateTab(btn.getAttribute("data-tab"));
      });
    });
  }

  if (el.daySelect) {
    el.daySelect.addEventListener("change", function () {
      selectDay(el.daySelect.value, false);
    });
  }

  if (el.fcBody) {
    el.fcBody.addEventListener("click", function (ev) {
      var t = ev.target;
      if (!t) return;
      var btn = t.closest ? t.closest("[data-day]") : null;
      if (!btn) return;
      selectDay(btn.getAttribute("data-day"), true);
    });
  }

  if (el.searchBtn) {
    el.searchBtn.addEventListener("click", function () {
      var q = (el.search && el.search.value) || "";
      if (!q.trim()) return;
      geocode(q.trim()).catch(function (e) {
        console.error("Meteo search error", e);
        if (el.place) el.place.textContent = "Ricerca fallita: " + (e.message || e);
      });
    });
  }
  if (el.search) {
    el.search.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") {
        ev.preventDefault();
        if (el.searchBtn) el.searchBtn.click();
      }
    });
  }
  if (el.geoBtn) {
    el.geoBtn.addEventListener("click", function () {
      useGeolocation().then(function (ok) {
        if (!ok) {
          state.lat = DEFAULT.lat;
          state.lon = DEFAULT.lon;
          state.label = DEFAULT.label;
          state.parcelName = "";
          setPlace();
          loadForecast().catch(function (e) { console.error(e); });
        }
      });
    });
  }
  if (el.geojson) {
    el.geojson.addEventListener("change", function () {
      var file = el.geojson.files && el.geojson.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var gj = JSON.parse(String(reader.result || ""));
          applyParcel(gj).catch(function (e) { console.error(e); });
        } catch (e) {
          console.error("GeoJSON parse error", e);
          if (el.place) el.place.textContent = "GeoJSON non valido";
        }
      };
      reader.readAsText(file);
    });
  }

  window.addEventListener("gowl:parcel-selected", function (ev) {
    var detail = (ev && ev.detail) || {};
    try {
      if (detail.geojson) {
        applyParcel(detail.geojson, detail.name).catch(function (e) { console.error(e); });
      } else if (detail.lat != null && detail.lon != null) {
        state.lat = Number(detail.lat);
        state.lon = Number(detail.lon);
        state.parcelName = detail.name || "Appezzamento Viewer";
        state.label = "Viewer VRA";
        setPlace();
        loadForecast().catch(function (e) { console.error(e); });
      }
    } catch (e) {
      console.error("parcel-selected error", e);
    }
  });

  window.addEventListener("message", function (ev) {
    var data = ev && ev.data;
    if (!data || data.type !== "gowl:parcel-selected") return;
    window.dispatchEvent(
      new CustomEvent("gowl:parcel-selected", { detail: data.detail || data })
    );
  });

  var viewer = document.getElementById("viewer");
  if (viewer) {
    viewer.addEventListener("dragover", function (e) {
      e.preventDefault();
      viewer.classList.add("meteo-drop-active");
    });
    viewer.addEventListener("dragleave", function () {
      viewer.classList.remove("meteo-drop-active");
    });
    viewer.addEventListener("drop", function (e) {
      e.preventDefault();
      viewer.classList.remove("meteo-drop-active");
      var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          applyParcel(JSON.parse(String(reader.result || ""))).catch(function (err) {
            console.error(err);
          });
          var section = document.getElementById("finestre-operative");
          if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
        } catch (err) {
          console.error("Drop GeoJSON error", err);
        }
      };
      reader.readAsText(file);
    });
  }

  bindTabs();
  setPlace();

  useGeolocation()
    .then(function (ok) {
      if (!ok) {
        state.lat = DEFAULT.lat;
        state.lon = DEFAULT.lon;
        state.label = DEFAULT.label;
        setPlace();
      }
      return loadForecast();
    })
    .catch(function (e) {
      console.error("Meteo load error", e);
      state.lat = DEFAULT.lat;
      state.lon = DEFAULT.lon;
      state.label = DEFAULT.label;
      setPlace();
      return loadForecast();
    });
})();
