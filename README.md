# MMM-LameteoAgricole

Module [MagicMirror²](https://magicmirror.builders/) affichant la météo française depuis [lameteoagricole.net](https://www.lameteoagricole.net) — **sans clé API**.

Données scrappées directement depuis le site, avec icônes Weather Icons natives de MagicMirror².

![screenshot](screenshot.png)

## Fonctionnalités

- Conditions actuelles : température, ressenti, vent, rafales, prochain lever/coucher de soleil
- Pluie dans l'heure suivante (données minute par minute)
- Prévisions heure par heure (heures futures uniquement)
- Prévisions sur 10 jours : températures min/max, précipitations, vent + rafales

## Installation

```bash
cd ~/MagicMirror/modules
git clone https://github.com/kamasoutra/MMM-LameteoAgricole.git
```

Aucune dépendance npm à installer.

## Configuration

Dans `config/config.js` :

```js
{
  module: "MMM-LameteoAgricole",
  position: "top_right",
  config: {
    commune: "Ruan-45410",       // Nom de commune tel qu'il apparaît dans l'URL lameteoagricole.net
    title: "Météo Ruan",         // Titre du module (vide pour aucun)
    showHourlyRows: 6,           // Nombre d'heures affichées
    showDailyRows: 10,           // Nombre de jours affichés (max 10)
    updateInterval: 30 * 60 * 1000  // Rafraîchissement (ms), défaut 30 min
  }
}
```

### Trouver le nom de ta commune

Cherche ta commune sur [lameteoagricole.net](https://www.lameteoagricole.net) et relève le slug dans l'URL :

```
https://www.lameteoagricole.net/previsions-meteo-agricole/Ruan-45410.html
                                                          ^^^^^^^^^^^
                                                          → commune: "Ruan-45410"
```

## Licence

MIT
