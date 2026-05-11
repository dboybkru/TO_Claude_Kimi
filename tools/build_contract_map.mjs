import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const input = path.join(root, 'docs', 'contract-10944505', 'objects.csv')
const outputCsv = path.join(root, 'docs', 'contract-10944505', 'objects-map.csv')
const outputHtml = path.join(root, 'docs', 'contract-10944505', 'objects-map.html')

const coords = {
  'калининград': [54.7104, 20.4522],
  'черняховск': [54.6333, 21.8156],
  'советск': [55.0839, 21.8785],
  'балтийск': [54.6431, 19.8922],
  'гусев': [54.5916, 22.2016],
  'гвардейск': [54.6477, 21.0670],
  'гурьевск': [54.7732, 20.6052],
  'зеленоградск': [54.9600, 20.4758],
  'светлогорск': [54.9439, 20.1512],
  'светлый': [54.6750, 20.1347],
  'пионерский': [54.9510, 20.2275],
  'неман': [55.0393, 22.0264],
  'нестеров': [54.6316, 22.5714],
  'правдинск': [54.4431, 21.0179],
  'мамоново': [54.4646, 19.9389],
  'полесск': [54.8627, 21.1008],
  'озерск': [54.4106, 22.0117],
  'краснознаменск': [54.9454, 22.4926],
  'багратионовск': [54.3867, 20.6419],
  'ладушкин': [54.5701, 20.1726],
  'славск': [55.0447, 21.6774],
  'янтарный': [54.8710, 19.9400],
  'приморск': [54.7312, 19.9982],
  'приморье': [54.9290, 20.0720],
  'донское': [54.9350, 19.9700],
  'северная гора': [54.7520, 20.5300],
  'суворово': [54.7000, 20.5700],
  'космодемьянский': [54.7290, 20.3490],
  'чкаловск': [54.7650, 20.3920],
  'храброво': [54.8900, 20.5920],
  'малое васильково': [54.7790, 20.6150],
  'большое исаково': [54.7200, 20.5900],
  'малое исаково': [54.7240, 20.6070],
  'луговое': [54.7440, 20.6500],
  'орловка': [54.8090, 20.5760],
  'родники': [54.8220, 20.5160],
  'низовье': [54.7900, 20.7200],
  'заречье': [54.7720, 20.7550],
  'малинники': [54.7550, 20.7600],
  'некрасово': [54.7900, 20.8200],
  'матросово': [54.8050, 20.8200],
  'моргуново': [54.7800, 20.8750],
  'высокое': [54.7650, 20.8350],
  'маршальское': [54.8300, 20.9000],
  'рассвет': [54.7600, 20.9250],
  'коврово': [54.9030, 20.5700],
  'муромское': [54.9300, 20.7200],
  'романово': [54.8990, 20.3000],
  'заостровье': [54.9800, 20.3100],
  'заозерье': [54.7600, 20.6800],
  'вишневое': [54.8850, 20.4300],
  'борисово': [54.6550, 20.5000],
  'знаменск': [54.6140, 21.2250],
  'талпаки': [54.6350, 21.2250],
  'озерки': [54.6900, 21.1000],
  'малиновка': [54.7000, 21.1900],
  'борское': [54.7000, 21.3000],
  'красный яр': [54.7300, 21.1600],
  'маевское': [54.7100, 21.2600],
  'маяковское': [54.6430, 22.0400],
  'кубановка': [54.6200, 22.0900],
  'красногорское': [54.7200, 22.1200],
  'поддубы': [54.6380, 22.2350],
  'фурманово': [54.5650, 22.2200],
  'михайловка': [54.5700, 22.0950],
  'липово': [54.5400, 22.1100],
  'краснополянское': [54.7600, 21.7600],
  'большое село': [55.0550, 21.8050],
  'ульяново': [55.0700, 22.1200],
  'маломожайское': [55.0000, 22.1100],
  'тишино': [54.4500, 20.4800],
  'долгоруково': [54.4700, 20.6000],
  'чехово': [54.4000, 20.5200],
  'славское': [54.4200, 20.6000],
  'березовка': [54.4400, 20.7000],
  'надеждино': [54.5000, 20.7000],
  'багратиона': [54.6950, 20.5050],
  'аксакова': [54.7330, 20.5600],
  'колхозная': [54.7520, 20.5300],
  'тбилисская': [54.7000, 20.5700],
  'майский': [54.7100, 20.4700],
  'индустриальная': [54.7250, 20.5100],
  'озерова': [54.7280, 20.5000],
  'павлова': [54.6900, 20.4800],
  'дунайская': [54.6920, 20.4850],
  'горького': [54.7310, 20.5150],
  'киевская': [54.6800, 20.4700],
  'московский': [54.7060, 20.5350],
  'косогорная': [54.6950, 20.4700],
  'толстикова': [54.6900, 20.4350],
  'типографская': [54.7150, 20.5150],
  'докука': [54.7650, 20.3920],
  'гайдара': [54.7370, 20.5100],
  'галактическая': [54.7400, 20.5750],
  'лужская': [54.7290, 20.3490],
  'пушкинская': [54.7240, 20.6070],
  'геологическая': [54.7200, 20.5900],
}

const regionFallbacks = {
  'багратионовский': [54.43, 20.62],
  'гвардейский': [54.67, 21.12],
  'гурьевский': [54.78, 20.70],
  'гусевский': [54.60, 22.15],
  'зеленоградский': [54.92, 20.47],
  'краснознаменский': [54.93, 22.45],
  'неманский': [55.04, 22.04],
  'светловский': [54.69, 20.18],
  'черняховский': [54.67, 21.80],
}

function parseCsv(text) {
  const rows = []
  let row = []
  let value = ''
  let quoted = false
  const pushValue = () => { row.push(value); value = '' }
  const pushRow = () => { rows.push(row); row = [] }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]
    if (quoted) {
      if (ch === '"' && next === '"') { value += '"'; i++ }
      else if (ch === '"') quoted = false
      else value += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') pushValue()
    else if (ch === '\n') { pushValue(); pushRow() }
    else if (ch !== '\r') value += ch
  }
  if (value.length || row.length) { pushValue(); pushRow() }
  const headers = rows.shift()
  return rows.filter(r => r.length === headers.length).map(r => Object.fromEntries(headers.map((h, i) => [h.replace(/^\uFEFF/, ''), r[i]])))
}

function escapeCsv(value) {
  const s = String(value ?? '')
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}

function norm(value) {
  return String(value ?? '')
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replaceAll('б.', 'большое ')
    .replaceAll('м.', 'малое ')
    .replaceAll('р-н', 'район')
}

function jitter(key, lat, lng, scale) {
  const digest = crypto.createHash('sha1').update(key).digest()
  const a = (digest[0] / 255 - 0.5) * scale
  const b = (digest[1] / 255 - 0.5) * scale
  return [Number((lat + a).toFixed(6)), Number((lng + b).toFixed(6))]
}

function locate(row) {
  const text = norm([row.address, row.region, row.name].join(' '))
  const ordered = Object.entries(coords).sort((a, b) => b[0].length - a[0].length)
  for (const [name, [lat, lng]] of ordered) {
    if (text.includes(name)) {
      const [jLat, jLng] = jitter(row.name + row.address, lat, lng, 0.018)
      return { lat: jLat, lng: jLng, map_precision: 'settlement_approx', map_matched: name }
    }
  }
  for (const [name, [lat, lng]] of Object.entries(regionFallbacks)) {
    if (text.includes(name)) {
      const [jLat, jLng] = jitter(row.name + row.address, lat, lng, 0.055)
      return { lat: jLat, lng: jLng, map_precision: 'region_approx', map_matched: name }
    }
  }
  const [lat, lng] = jitter(row.name + row.address, 54.7104, 20.4522, 0.12)
  return { lat, lng, map_precision: 'needs_review', map_matched: 'калининградская область' }
}

function markerColor(type, precision) {
  if (precision === 'needs_review') return '#f59e0b'
  return { OS: '#22c55e', OS_OTS: '#38bdf8', SKUD: '#a78bfa', SKUD_OS: '#f472b6' }[type] ?? '#94a3b8'
}

const rows = parseCsv(fs.readFileSync(input, 'utf8'))
const mapped = rows.map(row => ({ ...row, ...locate(row) }))
const headers = [...Object.keys(mapped[0]), 'color'].filter((v, i, arr) => arr.indexOf(v) === i)
fs.writeFileSync(outputCsv, '\uFEFF' + [
  headers.join(','),
  ...mapped.map(row => headers.map(h => escapeCsv(h === 'color' ? markerColor(row.type, row.map_precision) : row[h])).join(',')),
].join('\r\n'), 'utf8')

const payload = mapped.map(row => ({
  name: row.name,
  address: row.address,
  type: row.type,
  region: row.region,
  lat: row.lat,
  lng: row.lng,
  precision: row.map_precision,
  matched: row.map_matched,
  color: markerColor(row.type, row.map_precision),
}))

const stats = {
  total: mapped.length,
  settlement: mapped.filter(r => r.map_precision === 'settlement_approx').length,
  region: mapped.filter(r => r.map_precision === 'region_approx').length,
  review: mapped.filter(r => r.map_precision === 'needs_review').length,
}

const html = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Объекты ТО Ростелеком, договор 10944505</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
  <style>
    html, body, #map { height: 100%; margin: 0; font-family: Arial, sans-serif; }
    .panel { position: absolute; z-index: 500; left: 16px; top: 16px; width: min(390px, calc(100vw - 32px)); background: #0f172aee; color: #e5e7eb; border: 1px solid #334155; border-radius: 8px; box-shadow: 0 18px 48px #0008; padding: 14px; }
    .panel h1 { font-size: 16px; margin: 0 0 8px; }
    .panel p { margin: 4px 0; font-size: 12px; color: #cbd5e1; }
    .legend { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px; margin-top: 10px; font-size: 12px; }
    .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; }
    .search { margin-top: 10px; width: 100%; box-sizing: border-box; padding: 8px 10px; border-radius: 6px; border: 1px solid #475569; background: #020617; color: #e5e7eb; }
    .leaflet-popup-content { font-size: 12px; line-height: 1.35; }
    .review { color: #92400e; font-weight: 700; }
  </style>
</head>
<body>
  <div id="map"></div>
  <div class="panel">
    <h1>Договор 10944505: карта объектов ТО</h1>
    <p>Всего точек: ${stats.total}. По населенному пункту: ${stats.settlement}. По району: ${stats.region}. Требуют проверки: ${stats.review}.</p>
    <p>Координаты приблизительные: карта нужна для первичного планирования выездов, точный геокодинг нужно сохранить в базу перед боевой эксплуатацией.</p>
    <input id="search" class="search" placeholder="Фильтр: город, адрес, объект, тип">
    <div class="legend">
      <span><i class="dot" style="background:#22c55e"></i>ОС</span>
      <span><i class="dot" style="background:#38bdf8"></i>ОС/ОТС</span>
      <span><i class="dot" style="background:#a78bfa"></i>СКУД</span>
      <span><i class="dot" style="background:#f59e0b"></i>Проверить</span>
    </div>
  </div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const objects = ${JSON.stringify(payload)};
    const map = L.map('map').setView([54.76, 20.85], 9);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap' }).addTo(map);
    const layer = L.layerGroup().addTo(map);
    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#039;'}[ch]));
    }
    function render(term = '') {
      layer.clearLayers();
      const q = term.trim().toLowerCase();
      objects
        .filter(o => !q || \`\${o.name} \${o.address} \${o.region} \${o.type} \${o.matched}\`.toLowerCase().includes(q))
        .forEach(o => {
          const marker = L.circleMarker([o.lat, o.lng], { radius: o.precision === 'needs_review' ? 7 : 5, color: '#0f172a', weight: 1, fillColor: o.color, fillOpacity: 0.86 });
          const precision = o.precision === 'needs_review' ? '<span class="review">нужно проверить адрес</span>' : (o.precision === 'region_approx' ? 'примерно по району' : 'примерно по населенному пункту');
          marker.bindPopup(\`<b>\${escapeHtml(o.name)}</b><br>\${escapeHtml(o.address)}<br>Тип: \${o.type}<br>Регион: \${escapeHtml(o.region || '')}<br>Координаты: \${precision}\`);
          marker.addTo(layer);
        });
    }
    document.getElementById('search').addEventListener('input', e => render(e.target.value));
    render();
  </script>
</body>
</html>
`

fs.writeFileSync(outputHtml, html, 'utf8')
console.log(JSON.stringify({ csv: outputCsv, html: outputHtml, ...stats }, null, 2))
