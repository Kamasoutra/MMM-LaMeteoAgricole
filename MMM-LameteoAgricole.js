/* MMM-LameteoAgricole – design calqué sur le module weather natif de MagicMirror² */
Module.register("MMM-LameteoAgricole", {
  defaults: {
    commune: "Ruan-45410",
    showHourlyRows: 8,
    showDailyRows: 10,
    updateInterval: 30 * 60 * 1000,
    animationSpeed: 800,
    title: "Météo Ruan",
  },

  getStyles() {
    return ["font-awesome.css", "weather-icons.css", "MMM-LameteoAgricole.css"];
  },

  getHeader() { return this.config.title || ""; },

  start() {
    this.daily       = [];
    this.hourly      = [];
    this.current     = null;
    this.rainNextHour= null;
    this.error       = null;
    this.loaded      = false;
    this.scheduleFetch();
  },

  scheduleFetch() {
    this.fetchMeteo();
    setInterval(() => this.fetchMeteo(), this.config.updateInterval);
    this.scheduleHourlyRefresh();
  },

  scheduleHourlyRefresh() {
    const now = new Date();
    const msUntilNextHour =
      (60 - now.getMinutes()) * 60 * 1000
      - now.getSeconds() * 1000
      - now.getMilliseconds();
    setTimeout(() => {
      this.fetchMeteo();
      setInterval(() => this.fetchMeteo(), 60 * 60 * 1000);
    }, msUntilNextHour);
  },

  fetchMeteo() {
    const base = "https://www.lameteoagricole.net";
    const c    = this.config.commune;
    this.sendSocketNotification("FETCH_METEO_AGRICOLE", {
      dailyUrl : `${base}/previsions-meteo-agricole/${c}.html`,
      hourlyUrl: `${base}/meteo-heure-par-heure/${c}.html`,
      minuteUrl: `${base}/meteo-minute-par-minute/${c}.html`,
    });
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "METEO_AGRICOLE_DATA") {
      this.daily        = payload.daily        || [];
      this.hourly       = payload.hourly       || [];
      this.current      = payload.current      || null;
      this.rainNextHour = payload.rainNextHour || null;
      this.loaded = true;
      this.error  = null;
      this.updateDom(this.config.animationSpeed);
    } else if (notification === "METEO_AGRICOLE_ERROR") {
      this.loaded = true;
      this.error  = payload.error;
      this.updateDom(this.config.animationSpeed);
    }
  },

  // Map description to weathericons class
  descToWi(desc, iconNum) {
    if (!desc) return "na";
    const d = desc.toLowerCase();
    const n = parseInt(iconNum) || 0;
    const isNight = n % 2 === 1 && n < 40;
    if (d.includes("orage"))                              return "thunderstorm";
    if (d.includes("grêle") || d.includes("grele"))       return "hail";
    if (d.includes("neige") || d.includes("flocon"))      return "snow";
    if (d.includes("brouillard") || d.includes("brume"))  return "fog";
    if (d.includes("bruine"))                             return "sprinkle";
    if (d.includes("pluie possible"))                     return isNight ? "night-alt-cloudy" : "day-cloudy";
    if (d.includes("averse"))                             return isNight ? "night-alt-showers" : "day-showers";
    if (d.includes("pluie") || d.includes("pluvieux"))    return isNight ? "night-alt-rain" : "day-rain";
    if (d.includes("ciel couvert") || d.includes("très nuageux")) return "cloudy";
    if (d.includes("peu nuageux") || d.includes("partiellement nuageux")) return isNight ? "night-alt-partly-cloudy" : "day-cloudy";
    if (d.includes("nuageux"))                            return isNight ? "night-alt-cloudy" : "day-cloudy";
    if (d.includes("ensoleillé") || d.includes("soleil")) return "day-sunny";
    if (d.includes("clair") || d.includes("dégagé"))      return isNight ? "night-clear" : "day-sunny";
    return "cloud";
  },

  // Determine next solar event given "07h05" style strings
  nextSunAction(sunrise, sunset) {
    if (!sunrise && !sunset) return null;
    const toMin = t => {
      const m = /(\d+)h(\d+)/.exec(t || "");
      return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : null;
    };
    const now = new Date().getHours() * 60 + new Date().getMinutes();
    const riseMin = toMin(sunrise);
    const setMin  = toMin(sunset);
    if (riseMin !== null && now < riseMin) return { type: "sunrise", time: sunrise.replace("h", ":") };
    if (setMin  !== null && now < setMin)  return { type: "sunset",  time: sunset.replace("h", ":") };
    if (riseMin !== null)                  return { type: "sunrise", time: sunrise.replace("h", ":") }; // demain
    return null;
  },

  el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls)  e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  },

  getDom() {
    const wrapper = this.el("div", "weather");

    if (!this.loaded) {
      wrapper.appendChild(this.el("div", "dimmed small", "Chargement…"));
      return wrapper;
    }
    if (this.error) {
      wrapper.appendChild(this.el("div", "dimmed small", "Erreur : " + this.error));
      return wrapper;
    }

    // ── Conditions actuelles (layout natif MM weather) ───────────────────
    const cur = this.current;
    if (cur) {
      const curDiv = this.el("div", "current");

      // Ligne 1 : vent + prochain événement soleil (petit)
      const row1 = this.el("div", "small dimmed");
      if (cur.windSpeed) {
        row1.appendChild(this.el("span", "wi wi-strong-wind"));
        row1.appendChild(this.el("span", null, ` ${cur.windSpeed} km/h ${cur.windDir || ""}  `));
      }
      const sunAction = this.nextSunAction(cur.sunrise, cur.sunset);
      if (sunAction) {
        row1.appendChild(this.el("span", `wi wi-${sunAction.type}`));
        row1.appendChild(this.el("span", null, `  ${sunAction.time}`));
      }
      curDiv.appendChild(row1);

      // Ligne 2 : grande icône + température
      const row2 = this.el("div", "flex large type-temp");
      row2.appendChild(this.el("span", `light wi weathericon wi-${this.descToWi(cur.description, cur.iconNum)}`));
      row2.appendChild(this.el("span", "light bright", `${cur.temp !== null ? cur.temp : "—"}°`));
      curDiv.appendChild(row2);

      // Ligne 3 : ressenti (style natif : "Feels like 12°C" en dimmed)
      if (cur.feelsLike !== null) {
        const row3 = this.el("div", "normal medium feelslike");
        row3.appendChild(this.el("span", "dimmed", `ressenti ${cur.feelsLike}°C`));
        curDiv.appendChild(row3);
      }
      wrapper.appendChild(curDiv);

      // Ligne 4 : pluie dans l'heure (petit)
      const rain = this.rainNextHour;
      if (rain && rain.total > 0) {
        const row5 = this.el("div", "small");
        row5.appendChild(this.el("span", "wi wi-umbrella dimmed"));
        row5.appendChild(this.el("span", "bright", ` ${rain.total} mm `));
        row5.appendChild(this.el("span", "dimmed", "dans l'heure"));
        wrapper.appendChild(row5);
      } else if (rain) {
        const row5 = this.el("div", "small dimmed");
        row5.appendChild(this.el("span", "wi wi-umbrella"));
        row5.appendChild(this.el("span", null, " pas de pluie dans l'heure"));
        wrapper.appendChild(row5);
      }
    }

    // ── Prévisions heure par heure (à partir de l'heure prochaine) ───────
    const nowHour = new Date().getHours();
    // dayOffset > 0 = heure du lendemain ou au-delà → toujours incluse
    const futureHourly = this.hourly.filter(h => h.dayOffset > 0 || h.hour > nowHour);
    const hourlyRows = futureHourly.slice(0, this.config.showHourlyRows);
    if (hourlyRows.length > 0) {
      wrapper.appendChild(this.el("div", "forecast-title small dimmed", "HEURE PAR HEURE"));
      const table = this.el("table", "forecast");
      hourlyRows.forEach(h => {
        const tr = document.createElement("tr");
        // Heure
        const tdH = this.el("td", "day");
        const hLabel = (h.label || "").replace(/.*?(\d+h)$/, "$1");
        tdH.textContent = hLabel;
        tr.appendChild(tdH);
        // Icône
        const tdI = this.el("td", "");
        tdI.appendChild(this.el("span", `wi wi-${this.descToWi(h.description, h.iconNum)} weathericon small`));
        tr.appendChild(tdI);
        // Temp
        tr.appendChild(this.el("td", "align-right bright", `${h.temp !== null ? h.temp : "—"}°`));
        // Précip + vent empilés dans une seule colonne
        const hHasPrecip = h.precipProb > 0;
        const hHasWind   = !!h.windSpeed;
        const tdPW = this.el("td", "align-right dimmed xsmall");
        if (hHasPrecip) tdPW.appendChild(this.el("div", null, `${h.precipMm}mm - ${h.precipProb}%`));
        if (hHasWind)   tdPW.appendChild(this.el("div", null, h.windGust ? `${h.windSpeed} - ${h.windGust} km/h` : `${h.windSpeed} km/h`));
        tr.appendChild(tdPW);
        table.appendChild(tr);
      });
      wrapper.appendChild(table);
    }

    // ── Prévisions par jour ───────────────────────────────────────────────
    const dailyRows = this.daily.slice(0, this.config.showDailyRows);
    if (dailyRows.length > 0) {
      wrapper.appendChild(this.el("div", "forecast-title small dimmed", "PRÉVISIONS"));
      const table = this.el("table", "forecast");
      const today    = new Date().getDate();
      const tomorrow = new Date(Date.now() + 86400000).getDate();
      dailyRows.forEach(d => {
        const tr = document.createElement("tr");
        // Jour : "aujourd'hui", "demain", ou abréviation (ex: "lun.")
        const dayNumM = /(\d+)/.exec(d.label);
        const dayNum  = dayNumM ? parseInt(dayNumM[1]) : null;
        let dayLabel;
        if (dayNum === today)    dayLabel = "aujourd'hui";
        else if (dayNum === tomorrow) dayLabel = "demain";
        else dayLabel = d.label.split(" ")[0]; // ex: "lun."
        tr.appendChild(this.el("td", "day", dayLabel));
        // Icône
        const tdI = this.el("td", "");
        tdI.appendChild(this.el("span", `wi wi-${this.descToWi(d.description, d.iconNum)} weathericon`));
        tr.appendChild(tdI);
        // Temp max
        tr.appendChild(this.el("td", "align-right bright", `${d.tempMax !== null ? d.tempMax : "—"}°`));
        // Temp min
        tr.appendChild(this.el("td", "align-right dimmed", `${d.tempMin !== null ? d.tempMin : "—"}°`));
        // Précip + vent empilés dans une seule colonne
        const dHasPrecip = d.precipProb > 0;
        const dHasWind   = !!d.windSpeed;
        const tdPW = this.el("td", "align-right dimmed xsmall");
        if (dHasPrecip) tdPW.appendChild(this.el("div", null, `${d.precipMm}mm - ${d.precipProb}%`));
        if (dHasWind)   tdPW.appendChild(this.el("div", null, d.windGust ? `${d.windSpeed} - ${d.windGust} km/h` : `${d.windSpeed} km/h`));
        tr.appendChild(tdPW);
        table.appendChild(tr);
      });
      wrapper.appendChild(table);
    }

    return wrapper;
  },
});
