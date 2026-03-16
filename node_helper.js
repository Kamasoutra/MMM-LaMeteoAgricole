"use strict";
const NodeHelper = require("node_helper");
const https = require("https");

module.exports = NodeHelper.create({
  start() {},

  socketNotificationReceived(notification, payload) {
    if (notification === "FETCH_METEO_AGRICOLE") {
      this.fetchAll(payload);
    }
  },

  fetchPage(url) {
    return new Promise((resolve, reject) => {
      https.get(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; MagicMirror/2)",
          "Accept-Language": "fr-FR,fr;q=0.9"
        }
      }, res => {
        let data = "";
        res.on("data", chunk => data += chunk);
        res.on("end", () => resolve(data));
      }).on("error", reject);
    });
  },

  async fetchAll(config) {
    try {
      const [dailyHtml, hourlyHtml, minuteHtml] = await Promise.all([
        this.fetchPage(config.dailyUrl),
        this.fetchPage(config.hourlyUrl),
        this.fetchPage(config.minuteUrl),
      ]);
      const daily = this.parseDaily(dailyHtml);
      const hourly = this.parseHourly(hourlyHtml);
      const current = this.parseCurrent(minuteHtml);
      const rainNextHour = this.parseRainNextHour(minuteHtml);
      this.sendSocketNotification("METEO_AGRICOLE_DATA", { daily, hourly, current, rainNextHour });
    } catch (err) {
      this.sendSocketNotification("METEO_AGRICOLE_ERROR", { error: err.message });
    }
  },

  stripTags(html) {
    return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  },

  parseCurrent(html) {
    const idx = html.indexOf("Conditions observées");
    if (idx < 0) return null;
    const chunk = html.slice(idx, idx + 3000);

    const timeMatch   = /Observations à (\d+:\d+)/.exec(chunk);
    const descMatch   = /<p>([^<]+)<\/p>/.exec(chunk);
    const tempMatch   = /<span class="h3">\s*(-?\d+)°/.exec(chunk);
    const iconMatch   = /Weather\/numbers\/(\d+)\.svg"/.exec(chunk);
    const feelsMatch  = /Ressenti[\s\S]{0,200}?<span class="fw-bold">(-?\d+)<\/span>/.exec(chunk);
    const humidMatch  = /Humidité relative[\s\S]{0,200}?<span class="fw-bold">(\d+)<\/span>/.exec(chunk);
    const windSpeedM  = /Vent[\s\S]{0,200}?<span class="fw-bold">(\d+)<\/span> km\/h/.exec(chunk);
    const windDirM    = /Direction vent[\s\S]{0,200}?<span class="fw-bold">([A-Z]+)<\/span>/.exec(chunk);
    // lever/coucher peuvent être n'importe où dans la page
    const sunriseM    = /sunrise\.svg[^>]*>[\s\S]{0,100}?<span class="small">(\d+h\d+)<\/span>/.exec(html);
    const sunsetM     = /sunset\.svg[^>]*>[\s\S]{0,100}?<span class="small">(\d+h\d+)<\/span>/.exec(html);

    return {
      time:       timeMatch  ? timeMatch[1]           : null,
      description:descMatch  ? descMatch[1].trim()    : null,
      temp:       tempMatch  ? parseInt(tempMatch[1]) : null,
      iconNum:    iconMatch  ? iconMatch[1]            : null,
      feelsLike:  feelsMatch ? parseInt(feelsMatch[1]): null,
      humidity:   humidMatch ? parseInt(humidMatch[1]): null,
      windSpeed:  windSpeedM ? parseInt(windSpeedM[1]): null,
      windDir:    windDirM   ? windDirM[1]             : null,
      sunrise:    sunriseM   ? sunriseM[1]             : null,
      sunset:     sunsetM    ? sunsetM[1]              : null,
    };
  },

  parseRainNextHour(html) {
    // Chart.js data embedded in a <script> block
    const scriptMatch = /const myChart = new Chart\(ctx,\s*\{([\s\S]*?)\}\s*\);/.exec(html);
    if (!scriptMatch) return null;

    const labelsMatch = /labels:\s*(\[[\s\S]*?\])/.exec(scriptMatch[1]);
    const dataMatch   = /data:\s*(\[[\s\S]*?\])/.exec(scriptMatch[1]);
    if (!labelsMatch || !dataMatch) return null;

    try {
      const labels = JSON.parse(labelsMatch[1]);
      const data   = JSON.parse(dataMatch[1]);
      const total  = data.reduce((s, v) => s + (parseFloat(v) || 0), 0);
      const maxVal = Math.max(...data);
      // Next 15 min buckets for display (first 15 entries ≈ 15 min)
      const nextSlices = data.slice(0, 15);
      return { labels, data, total: Math.round(total * 100) / 100, maxVal, nextSlices };
    } catch {
      return null;
    }
  },

  parseDayCell(td) {
    const iconM   = /Weather\/numbers\/(\d+)\.svg" alt="([^"]*)"/.exec(td);
    const tmaxM   = /<span class="fw-bold fs-4 text-warning">(-?\d+)/.exec(td);
    const tminM   = /min(?:&nbsp;|\s)(-?\d+)°/.exec(td);
    const pmmM    = /<span class="fw-bold">(\d+(?:\.\d+)?)<\/span><span class="small fw-normal">mm/.exec(td);
    const pprobM  = /<span class="small text-shade-3 noModal">(\d+)%/.exec(td);
    const wdirM   = /Direction du vent : ([A-Z]+)"/.exec(td);
    const wspdM   = /<span class="fw-bold">(\d+)<\/span><span class="small fw-normal">km\/h/.exec(td);
    const gustM   = /<span class="small text-shade-3(?!\s*noModal)[^"]*">(\d+)\s*km\/h<\/span>/.exec(td);

    return {
      iconNum:    iconM  ? iconM[1]              : null,
      description:iconM  ? iconM[2]              : "?",
      tempMax:    tmaxM  ? parseInt(tmaxM[1])    : null,
      tempMin:    tminM  ? parseInt(tminM[1])    : null,
      precipMm:   pmmM   ? parseFloat(pmmM[1])   : 0,
      precipProb: pprobM ? parseInt(pprobM[1])   : 0,
      windDir:    wdirM  ? wdirM[1]              : null,
      windSpeed:  wspdM  ? parseInt(wspdM[1])    : null,
      windGust:   gustM  ? parseInt(gustM[1])    : null,
    };
  },

  parseHourCell(td) {
    const iconM   = /Weather\/numbers\/(\d+)\.svg" alt="([^"]*)"/.exec(td);
    const tempM   = /<span class="fw-bold fs-4 text-warning">(-?\d+)/.exec(td);
    const feelsM  = /noModal">(-?\d+)°<\/span>/.exec(td);
    const pmmM    = /<span class="fw-bold">(\d+(?:\.\d+)?)<\/span><span class="small fw-normal">mm/.exec(td);
    const pprobM  = /<span class="small text-shade-3 noModal">(\d+)%/.exec(td);
    const wdirM   = /Direction du vent : ([A-Z]+)"/.exec(td);
    const wspdM   = /<span class="fw-bold">(\d+)<\/span><span class="small fw-normal">km\/h/.exec(td);
    const gustM   = /<span class="small text-shade-3(?!\s*noModal)[^"]*">(\d+)\s*km\/h<\/span>/.exec(td);
    const humidM  = /<span class="fw-bold">(\d+)<\/span><span class="small fw-normal">%<\/span>\s*<\/span>\s*<span class="small text-shade-3">Humidité/.exec(td);

    return {
      iconNum:    iconM  ? iconM[1]              : null,
      description:iconM  ? iconM[2]              : "?",
      temp:       tempM  ? parseInt(tempM[1])    : null,
      feelsLike:  feelsM ? parseInt(feelsM[1])   : null,
      precipMm:   pmmM   ? parseFloat(pmmM[1])   : 0,
      precipProb: pprobM ? parseInt(pprobM[1])   : 0,
      windDir:    wdirM  ? wdirM[1]              : null,
      windSpeed:  wspdM  ? parseInt(wspdM[1])    : null,
      windGust:   gustM  ? parseInt(gustM[1])    : null,
      humidity:   humidM ? parseInt(humidM[1])   : null,
    };
  },

  parseDaily(html) {
    // Extraire tous les en-têtes (y compris "Abonné" — les données sont quand même dans le HTML)
    const headers = [];
    const thRegex = /<th>([\s\S]*?)<\/th>/g;
    let m;
    while ((m = thRegex.exec(html)) !== null) {
      const th = m[1];
      const d  = /<span class="fw-bold">([^<]+)<\/span>/.exec(th);
      const n  = /<span class="fs-5[^"]*mt-1 mb-1">(\d+)<\/span>/.exec(th);
      const mo = /<span class="small text-shade-3">([^<]+)<\/span>/.exec(th);
      if (d && n && mo) headers.push(`${d[1].trim()} ${n[1]} ${mo[1].trim()}`);
    }

    const days = [];
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
    let count  = 0;
    while ((m = tdRe.exec(html)) !== null && count < headers.length) {
      days.push({ label: headers[count], ...this.parseDayCell(m[1]) });
      count++;
    }
    return days;
  },

  parseHourly(html) {
    const headers = [];
    const thRe = /<th>([\s\S]*?)<\/th>/g;
    let m;
    let lastHour = -1;
    let dayOffset = 0;
    while ((m = thRe.exec(html)) !== null) {
      const text = this.stripTags(m[1]);
      const hourM = /(\d+)h/.exec(text);
      if (hourM) {
        const h = parseInt(hourM[1]);
        if (h < lastHour) dayOffset++; // passage minuit → jour suivant
        lastHour = h;
        headers.push({ label: text.trim(), hour: h, dayOffset });
      }
    }

    const hours = [];
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
    let count = 0;
    while ((m = tdRe.exec(html)) !== null && count < headers.length) {
      hours.push({
        label:     headers[count].label,
        hour:      headers[count].hour,
        dayOffset: headers[count].dayOffset,
        ...this.parseHourCell(m[1])
      });
      count++;
    }
    return hours;
  }
});
