const DATA = window.LECCO_ENERGY_DATA;
const fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const fmt1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

document.getElementById('podCount').textContent = DATA.summary.podCount;
document.getElementById('locationCount').textContent = DATA.summary.locationCount;
document.getElementById('powerCount').textContent = DATA.summary.powerPodCount;

const map = L.map('map', { zoomControl: true }).setView([45.8527, 9.3985], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);
const markerLayer = L.markerClusterGroup({
  showCoverageOnHover: false,
  spiderfyOnMaxZoom: true,
  maxClusterRadius: 34,
  disableClusteringAtZoom: 17
});
map.addLayer(markerLayer);

let activeFilter = 'all';
let searchTerm = '';
let selectedId = null;
let monthlyChart = null;
let profileChart = null;
const markerById = new Map();

const energyValues = DATA.locations.map(d => d.latest12ObservedKWh).filter(Boolean);
const minEnergy = Math.min(...energyValues);
const maxEnergy = Math.max(...energyValues);
function markerSize(value) {
  const lo = Math.log1p(minEnergy), hi = Math.log1p(maxEnergy);
  const t = hi === lo ? .5 : (Math.log1p(value || minEnergy) - lo) / (hi - lo);
  return Math.round(24 + Math.max(0, Math.min(1, t)) * 18);
}

function markerIcon(location) {
  const size = markerSize(location.latest12ObservedKWh);
  const cls = location.powerPods.length ? 'power' : 'monthly';
  return L.divIcon({
    className: '',
    html: `<div class="energy-marker ${cls}" style="width:${size}px;height:${size}px" data-marker-id="${location.id}">${location.id}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2]
  });
}

DATA.locations.forEach(location => {
  const marker = L.marker([location.lat, location.lon], { icon: markerIcon(location), title: location.address })
    .bindPopup(`<strong>${location.address}</strong><br>${location.pods.length} POD${location.pods.length > 1 ? 's' : ''} · ${location.dataType}`)
    .on('click', () => selectLocation(location.id));
  marker.location = location;
  markerLayer.addLayer(marker);
  markerById.set(location.id, marker);
});

const bounds = L.latLngBounds(DATA.locations.map(d => [d.lat, d.lon]));
map.fitBounds(bounds.pad(.12));

function matches(location) {
  const filterOk = activeFilter === 'all' ||
    (activeFilter === 'power' && location.powerPods.length) ||
    (activeFilter === 'monthly' && !location.powerPods.length);
  if (!filterOk) return false;
  if (!searchTerm) return true;
  const haystack = `${location.address} ${location.municipality} ${location.pods.join(' ')}`.toLowerCase();
  return haystack.includes(searchTerm);
}

function refreshMarkers() {
  const visible = [];
  markerById.forEach((marker, id) => {
    if (matches(marker.location)) {
      if (!markerLayer.hasLayer(marker)) markerLayer.addLayer(marker);
      visible.push(marker.getLatLng());
    } else if (markerLayer.hasLayer(marker)) {
      markerLayer.removeLayer(marker);
    }
  });
  if (visible.length) map.fitBounds(L.latLngBounds(visible).pad(.13), { maxZoom: 15 });
}

document.querySelectorAll('.filter').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.filter').forEach(b => b.classList.remove('active'));
    button.classList.add('active');
    activeFilter = button.dataset.filter;
    refreshMarkers();
  });
});

document.getElementById('searchInput').addEventListener('input', event => {
  searchTerm = event.target.value.trim().toLowerCase();
  refreshMarkers();
  if (searchTerm.length >= 3) {
    const first = DATA.locations.find(matches);
    if (first) selectLocation(first.id, false);
  }
});

function formatEnergy(value) {
  if (value >= 1_000_000) return `${fmt1.format(value / 1_000_000)} GWh`;
  if (value >= 1_000) return `${fmt1.format(value / 1_000)} MWh`;
  return `${fmt.format(value)} kWh`;
}

function selectLocation(id, pan = true) {
  const location = DATA.locations.find(d => d.id === id);
  if (!location) return;
  selectedId = id;
  document.querySelectorAll('.energy-marker').forEach(el => el.classList.toggle('selected', Number(el.dataset.markerId) === id));
  if (pan) {
    const marker = markerById.get(id);
    markerLayer.zoomToShowLayer(marker, () => {
      map.flyTo([location.lat, location.lon], Math.max(map.getZoom(), 16), { duration: .45 });
      marker.openPopup();
    });
  }

  document.getElementById('locationKicker').textContent = `Location ${location.id} · ${location.municipality}`;
  document.getElementById('locationTitle').textContent = location.address;
  document.getElementById('locationMeta').textContent = location.matchedPlace || `${location.address}, ${location.municipality}`;

  const badge = document.getElementById('dataBadge');
  badge.textContent = location.dataType;
  badge.className = `data-badge ${location.powerPods.length ? 'power' : 'monthly'}`;

  document.getElementById('podList').innerHTML = location.pods.map(pod =>
    `<span class="pod-pill ${location.powerPods.includes(pod) ? 'has-power' : ''}">${pod}${location.powerPods.includes(pod) ? ' · 15m' : ''}</span>`
  ).join('');

  document.getElementById('latestEnergy').textContent = formatEnergy(location.latest12ObservedKWh);
  document.getElementById('latestEnergyNote').textContent = `Latest ${location.latest12Count} observed months`;
  document.getElementById('peakPower').textContent = location.peakKW == null ? 'Not available' : `${fmt1.format(location.peakKW)} kW`;
  document.getElementById('powerCoverage').textContent = location.powerStart ? `${location.powerStart} – ${location.powerEnd}` : 'No 15-minute series';
  document.getElementById('monthCoverage').textContent = `${location.monthly.length} months`;
  document.getElementById('monthRange').textContent = `${location.firstMonth} – ${location.lastMonth}`;

  const years = [...new Set(location.monthly.map(d => d.period.slice(0, 4)))].sort();
  const yearSelect = document.getElementById('yearSelect');
  yearSelect.innerHTML = `<option value="all">All years</option>${years.map(y => `<option value="${y}">${y}</option>`).join('')}`;
  const preferredYear = years.includes('2024') ? '2024' : years.at(-1);
  yearSelect.value = preferredYear || 'all';
  yearSelect.onchange = () => drawMonthlyChart(location, yearSelect.value);
  drawMonthlyChart(location, yearSelect.value);
  drawProfileChart(location);

  const powerNote = location.powerPods.length
    ? `The 15-minute profile uses ${location.powerPods.length} of ${location.pods.length} POD(s) at this address. Power values are averaged by quarter-hour across the available measurement periods.`
    : 'This address has monthly energy records only. A typical daily load profile cannot be calculated from the supplied files.';
  document.getElementById('methodNote').textContent = `${powerNote} Monthly duplicate records were reconciled against integrated 15-minute power where overlap was available.`;
}

function drawMonthlyChart(location, year) {
  const series = year === 'all' ? location.monthly : location.monthly.filter(d => d.period.startsWith(year));
  const ctx = document.getElementById('monthlyChart');
  if (monthlyChart) monthlyChart.destroy();
  monthlyChart = new Chart(ctx, {
    data: {
      labels: series.map(d => d.period),
      datasets: [
        { type: 'bar', label: 'F1', data: series.map(d => d.f1), backgroundColor: '#2563eb', stack: 'energy', borderWidth: 0 },
        { type: 'bar', label: 'F2', data: series.map(d => d.f2), backgroundColor: '#72a5f5', stack: 'energy', borderWidth: 0 },
        { type: 'bar', label: 'F3', data: series.map(d => d.f3), backgroundColor: '#c8dcfb', stack: 'energy', borderWidth: 0 },
        { type: 'line', label: 'Total', data: series.map(d => d.total), borderColor: '#152238', backgroundColor: '#152238', pointRadius: series.length > 30 ? 0 : 2, borderWidth: 1.6, tension: .22 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, font: { size: 10 } } },
        tooltip: { callbacks: { label: item => `${item.dataset.label}: ${fmt.format(item.raw)} kWh` } }
      },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { maxTicksLimit: 10, font: { size: 9 } } },
        y: { stacked: true, beginAtZero: true, title: { display: true, text: 'Energy (kWh)', font: { size: 10 } }, ticks: { font: { size: 9 } } }
      }
    }
  });
}

function drawProfileChart(location) {
  const section = document.getElementById('profileSection');
  if (profileChart) profileChart.destroy();
  if (!location.powerPods.length) {
    section.style.display = 'none';
    return;
  }
  section.style.display = '';
  const labels = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`);
  profileChart = new Chart(document.getElementById('profileChart'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Weekday', data: location.weekdayProfile, borderColor: '#e76f00', backgroundColor: 'rgba(231,111,0,.08)', fill: true, pointRadius: 0, borderWidth: 2, tension: .25, spanGaps: true },
        { label: 'Weekend', data: location.weekendProfile, borderColor: '#207a61', backgroundColor: 'transparent', pointRadius: 0, borderWidth: 1.8, borderDash: [5, 4], tension: .25, spanGaps: true }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, font: { size: 10 } } },
        tooltip: { callbacks: { label: item => `${item.dataset.label}: ${fmt1.format(item.raw)} kW` } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 7, font: { size: 9 } } },
        y: { beginAtZero: true, title: { display: true, text: 'Mean power (kW)', font: { size: 10 } }, ticks: { font: { size: 9 } } }
      }
    }
  });
}

selectLocation(DATA.locations[0].id, false);
