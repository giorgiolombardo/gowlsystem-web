/**
 * gOWLsystem-web — Finestre Operative (Meteo-VRA)
 * Ricerca/GPS, baricentro GeoJSON/Viewer, storico 3gg + forecast 7gg Open-Meteo.
 */
(function () {
  "use strict";

  var DEFAULT = { lat: 45.6983, lon: 9.6773, label: "Bergamo (default)" };
  var state = { lat: DEFAULT.lat, lon: DEFAULT.lon, label: DEFAULT.label, parcelName: "" };

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

  function setLiveStatus(windSpeed, humidity) {
    var statusEl = el.status;
    if (!statusEl) return;

    var wind = Number(windSpeed);
    var hum = Number(humidity);
    var red =
      "text-xs font-bold text-red-300 bg-red-900 px-2 py-1 rounded inline-block mt-1";
    var yellow =
      "text-xs font-bold text-amber-200 bg-amber-900 px-2 py-1 rounded inline-block mt-1";
    var green =
      "text-xs font-bold text-emerald-300 bg-emerald-900 px-2 py-1 rounded inline-block mt-1";

    // Priorità tassativa: vento → umidità eccessiva → aria secca → limite → ottimo
    if (wind >= 15) {
      statusEl.innerText = "VENTO FORTE (RISCHIO DERIVA)";
      statusEl.className = red;
    } else if (hum > 85) {
      statusEl.innerText = "UMIDITÀ ECCESSIVA (RISCHIO DILAVAMENTO)";
      statusEl.className = red;
    } else if (hum < 50) {
      statusEl.innerText = "ARIA SECCA (RISCHIO EVAPORAZIONE)";
      statusEl.className = yellow;
    } else if (hum >= 75 && hum <= 85) {
      statusEl.innerText = "UMIDITÀ ALTA (CONDIZIONE LIMITE)";
      statusEl.className = yellow;
    } else {
      // windSpeed < 15 E humidity tra 50 e 75
      statusEl.innerText = "OTTIMO (FINESTRA APERTA)";
      statusEl.className = green;
    }
  }

  function fmtDay(iso) {
    try {
      var d = new Date(iso + "T12:00:00");
      return d.toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "short" });
    } catch (e) {
      return iso;
    }
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
    el.histBody.innerHTML = rows.length
      ? rows.join("")
      : "<tr><td class='py-2 text-gray-500' colspan='4'>Nessun dato storico</td></tr>";
  }

  function renderForecast(daily, todayIdx) {
    var rows = [];
    var end = Math.min(daily.time.length, todayIdx + 7);
    for (var i = todayIdx; i < end; i++) {
      var rain = daily.precipitation_sum[i] || 0;
      var wind = daily.wind_speed_10m_max[i] || 0;
      var tmin = daily.temperature_2m_min[i];
      var tmax = daily.temperature_2m_max[i];
      var w = windowHint(wind, rain);
      rows.push(
        "<tr>" +
          "<td class='py-2 pr-2 text-white'>" + fmtDay(daily.time[i]) + "</td>" +
          "<td class='py-2 pr-2'>" +
            (tmin != null && tmax != null ? tmin.toFixed(0) + "° / " + tmax.toFixed(0) + "°" : "—") +
          "</td>" +
          "<td class='py-2 pr-2'>" + rain.toFixed(1) + " mm</td>" +
          "<td class='py-2 pr-2'>" + wind.toFixed(1) + " km/h</td>" +
          "<td class='py-2'><span class='meteo-badge " + w.cls + "'>" + w.text + "</span></td>" +
        "</tr>"
      );
    }
    el.fcBody.innerHTML = rows.join("");
  }

  async function loadForecast() {
    setPlace();
    var url =
      "https://api.open-meteo.com/v1/forecast?" +
      "latitude=" + encodeURIComponent(state.lat) +
      "&longitude=" + encodeURIComponent(state.lon) +
      "&current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation" +
      "&daily=precipitation_sum,wind_speed_10m_max,temperature_2m_max,temperature_2m_min" +
      "&past_days=3&forecast_days=7&timezone=auto";
    var res = await fetch(url);
    var data = await res.json();
    if (!data || !data.current) throw new Error("Risposta meteo non valida");

    el.temp.innerText = data.current.temperature_2m + " °C";
    el.wind.innerText = data.current.wind_speed_10m + " km/h";
    el.hum.innerText = data.current.relative_humidity_2m + " %";
    var windSpeed = data.current.wind_speed_10m;
    var humidity = data.current.relative_humidity_2m;
    setLiveStatus(windSpeed, humidity);

    var daily = data.daily;
    if (!daily || !daily.time) return;

    var today = (data.current.time || "").slice(0, 10);
    var todayIdx = daily.time.indexOf(today);
    if (todayIdx < 0) todayIdx = Math.min(3, daily.time.length - 1);

    renderHistory(daily, todayIdx);
    renderForecast(daily, todayIdx);
  }

  function bindTabs() {
    var tabs = document.querySelectorAll("#finestre-operative .meteo-tab");
    tabs.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var tab = btn.getAttribute("data-tab");
        tabs.forEach(function (b) {
          b.classList.toggle("is-active", b === btn);
          b.setAttribute("aria-selected", b === btn ? "true" : "false");
        });
        ["live", "history", "forecast"].forEach(function (id) {
          var panel = document.getElementById("meteo-panel-" + id);
          if (!panel) return;
          var on = id === tab;
          panel.hidden = !on;
          panel.classList.toggle("is-active", on);
        });
      });
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
