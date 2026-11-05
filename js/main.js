import { World, fmtTime, SKUS } from './sim.js';
import { Scene3D, truckStatus } from './scene.js';
import { CITIES, SUPPLIERS } from './data.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nf = new Intl.NumberFormat('ru-RU');

const world = new World();
let site = world.sites[0];
let selected = null; // { kind, id | idx }
let fleetTab = 'docks';
const startStock = Object.fromEntries(world.sites.map((s) => [s.id, s.totalStock]));

const scene = new Scene3D($('#viewport'), world, {
  labelLayer: $('#labels'),
  onPick: (ref) => select(ref),
});
$('#viewport').prepend(scene.renderer.domElement);

function setSite(s) {
  site = s;
  selected = null;
  scene.setSite(s);
  scene.setSelected(null);
  renderSiteBtn();
  refresh(true);
}

function select(ref, focus = false) {
  selected = ref;
  scene.setSelected(ref);
  if (ref && focus) {
    const p = scene.selectedPos();
    if (p) scene.focus(p.x, p.z, Math.min(scene.cam.tHalf, 34));
  }
  $('#detail').classList.toggle('open', !!ref);
  refresh(true);
}

// ---------- верхняя панель ----------
function renderSiteBtn() {
  const fill = Math.round((site.totalStock / site.cfg.capacity) * 100);
  const busy = site.docks.filter((d) => d.truck).length;
  $('#siteBtn').innerHTML = `<span class="code">${site.id}</span><span><b>${esc(site.cfg.name)}</b><small>Заполнено ${fill}% · ${busy}/${site.docks.length} ворот занято</small></span><span class="muted">▾</span>`;
}
$('#siteBtn').onclick = (e) => {
  e.stopPropagation();
  const m = $('#siteMenu');
  m.innerHTML = world.sites.map((s) => `<div class="item ${s === site ? 'on' : ''}" data-id="${s.id}"><span class="code">${s.id}</span><div><b>${esc(s.cfg.name)}</b><small>${esc(s.cfg.address)} · ${nf.format(s.totalStock)}/${nf.format(s.cfg.capacity)} палл.</small></div></div>`).join('');
  m.classList.toggle('hidden');
  $$('.item', m).forEach((it) => (it.onclick = () => { m.classList.add('hidden'); setSite(world.site(it.dataset.id)); }));
};

$$('#speed button').forEach((b) => (b.onclick = () => {
  const s = +b.dataset.s;
  world.paused = s === 0;
  if (s) world.speed = s;
  $$('#speed button').forEach((x) => x.classList.toggle('on', x === b));
}));

$$('.mapctl button').forEach((b) => (b.onclick = () => {
  const a = b.dataset.a;
  if (a === 'in') scene.zoomBy(0.8);
  if (a === 'out') scene.zoomBy(1.25);
  if (a === 'rl') scene.rotateBy(Math.PI / 4);
  if (a === 'rr') scene.rotateBy(-Math.PI / 4);
  if (a === 'home') scene.resetView();
}));

// поиск
const search = $('#search'), results = $('#searchResults');
function searchItems(q) {
  q = q.trim().toLowerCase();
  if (!q) return [];
  const out = [];
  for (const s of world.sites) {
    for (const t of s.trucks) {
      const hay = `${t.id} ${t.carrier.name} ${t.shipment.id} ${t.shipment.party} ${SKUS[t.sku].name}`.toLowerCase();
      if (hay.includes(q)) out.push({ s, ref: { kind: 'truck', id: t.id }, ic: '⛟', title: `${t.id} · ${t.carrier.name}`, sub: `${s.id} · ${truckStatus(t).text} · ${t.shipment.id}` });
    }
    for (const f of s.forklifts) if (`${f.id} ${f.driver}`.toLowerCase().includes(q)) out.push({ s, ref: { kind: 'forklift', id: f.id }, ic: '⚙', title: `${f.id} · ${f.driver}`, sub: `${s.id} · погрузчик` });
    for (const k of Object.keys(s.stock)) if (SKUS[k].name.toLowerCase().includes(q) || k.toLowerCase().includes(q)) out.push({ s, ref: { kind: 'stock' }, ic: '▦', title: SKUS[k].name, sub: `${s.id} · остаток ${s.stock[k]} палл.` });
    s.docks.forEach((d, i) => { if (d.id.toLowerCase().includes(q)) out.push({ s, ref: { kind: 'dock', idx: i }, ic: '▭', title: d.id, sub: `${s.id} · ${d.truck ? 'занято ' + d.truck.id : 'свободно'}` }); });
    if (`${s.id} ${s.cfg.name}`.toLowerCase().includes(q)) out.push({ s, ref: { kind: 'site' }, ic: '◈', title: `${s.id} · ${s.cfg.name}`, sub: s.cfg.address });
  }
  return out.slice(0, 12);
}
search.oninput = () => {
  const items = searchItems(search.value);
  results.classList.toggle('hidden', !search.value.trim());
  results.innerHTML = items.length ? items.map((it, i) => `<div class="item" data-i="${i}"><span>${it.ic}</span><div><b>${esc(it.title)}</b><small>${esc(it.sub)}</small></div></div>`).join('') : '<div class="item muted">Ничего не найдено</div>';
  $$('.item[data-i]', results).forEach((el) => (el.onclick = () => {
    const it = items[+el.dataset.i];
    if (it.s !== site) setSite(it.s);
    select(it.ref, true);
    results.classList.add('hidden'); search.value = ''; search.blur();
  }));
};
search.onkeydown = (e) => { if (e.key === 'Enter') $('.item[data-i]', results)?.click(); if (e.key === 'Escape') { search.value = ''; results.classList.add('hidden'); search.blur(); } };
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); search.focus(); }
  if (e.key === 'Escape' && document.activeElement.tagName !== 'INPUT') { closeModals(); select(null); }
  if (e.key === ' ' && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); $(`#speed button[data-s="${world.paused ? world.speed : 0}"]`)?.click(); }
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.search')) results.classList.add('hidden');
  if (!e.target.closest('.sitepick')) $('#siteMenu').classList.add('hidden');
  if (!e.target.closest('.bell-wrap')) $('#alerts').classList.add('hidden');
});

// уведомления
function renderBell() {
  const n = world.alerts.filter((a) => !a.read).length;
  $('#bellCount').textContent = n; $('#bellCount').classList.toggle('hidden', !n);
}
world.on('alert', renderBell);
$('#bellBtn').onclick = (e) => {
  e.stopPropagation();
  const box = $('#alerts');
  box.innerHTML = world.alerts.length
    ? world.alerts.map((a) => `<div class="item ${a.read ? '' : 'unread'}"><span>⚠</span><div><b>${a.site} · ${fmtTime(a.t)}</b><small>${esc(a.text)}</small></div></div>`).join('')
    : '<div class="item muted">Нет уведомлений</div>';
  box.classList.toggle('hidden');
  world.alerts.forEach((a) => (a.read = true));
  renderBell();
};

function toast(text, kind = '') {
  const t = document.createElement('div');
  t.className = `toast ${kind}`; t.textContent = text;
  $('#toasts').appendChild(t);
  while ($('#toasts').children.length > 3) $('#toasts').firstChild.remove();
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 450); }, 3600);
}
world.on('toast', ({ site: s, kind, text }) => { if (s === site) toast(text, kind); });

// ---------- KPI ----------
function renderKpis() {
  const st = site.totalStock, d = st - startStock[site.id];
  $('#kStock').textContent = nf.format(st);
  $('#kStockD').textContent = (d >= 0 ? '↑ ' : '↓ ') + Math.abs(d);
  $('#kStockD').className = d < 0 ? 'neg' : '';
  $('#kStockS').textContent = `палл. · ${site.id} · ${Math.round((st / site.cfg.capacity) * 100)}% ёмкости`;
  const on = site.trucks.filter((t) => ['toDock', 'docked', 'closing', 'waiting'].includes(t.state)).length;
  const inb = site.trucks.filter((t) => t.state === 'arriving').length;
  $('#kTrucks').textContent = on;
  $('#kTrucksD').textContent = inb ? `+${inb}` : '';
  $('#kTrucksS').textContent = `${inb} в пути · ${site.trucks.filter((t) => t.state === 'waiting').length} в очереди`;
  const pct = site.stats.served ? (site.stats.onTime / site.stats.served) * 100 : 100;
  $('#kOnTime').textContent = pct.toFixed(1).replace('.', ',') + '%';
  $('#kOnTimeD').textContent = `${site.stats.onTime}/${site.stats.served}`;
  $('#kOps').textContent = nf.format(site.stats.inPallets + site.stats.outPallets);
  $('#kOpsS').textContent = `⇣ ${site.stats.inPallets} принято · ⇡ ${site.stats.outPallets} отгружено`;
}

// ---------- правая панель ----------
const stockStatus = (s, k) => {
  const q = s.stock[k], m = s.min[k];
  if (q < m * 0.5) return { t: 'Критично', c: 'red' };
  if (q < m) return { t: 'Мало', c: 'amber' };
  return { t: 'В наличии', c: 'green' };
};
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const swatch = (k) => `<span class="sw-sku" style="background:${hex(SKUS[k].color)}"></span>`;

function inventoryRows(s, click = true) {
  return Object.keys(s.stock).map((k) => {
    const st = stockStatus(s, k);
    return `<div class="r ${click ? 'click' : ''}" data-sku="${k}">${swatch(k)}<span class="k" style="color:var(--ink)">${esc(SKUS[k].name)}</span><span class="v">${nf.format(s.stock[k])}</span><span class="chip ${st.c}">${st.t}</span></div>`;
  }).join('');
}

function detailSite() {
  const s = site;
  const docked = s.trucks.filter((t) => t.state === 'docked' || t.state === 'closing').length;
  const arriving = s.trucks.filter((t) => t.state === 'arriving' || t.state === 'toDock').length;
  const waiting = s.trucks.filter((t) => t.state === 'waiting').length;
  const fill = s.totalStock / s.cfg.capacity;
  const avgDwell = s.stats.dwell.length ? Math.round(s.stats.dwell.reduce((a, b) => a + b, 0) / s.stats.dwell.length) : 0;
  return `
  <div class="d-head"><div class="d-ic">◈</div><div><div class="d-kicker">${esc(s.cfg.kind)} · ${s.id}</div><div class="d-title">${esc(s.cfg.name)}</div><div class="d-sub">${esc(s.cfg.address)}</div></div></div>
  <div class="chips"><span class="chip green">● Работает</span><span class="chip">${docked} у ворот</span><span class="chip">${arriving} подъезжает</span><span class="chip ${waiting ? 'amber' : ''}">${waiting} в очереди</span></div>
  <div class="grid2">
    <div class="stat"><small>Остаток</small><b>${nf.format(s.totalStock)} <span>/ ${nf.format(s.cfg.capacity)}</span></b><div class="bar ${fill > 0.9 ? 'red' : ''}"><div style="width:${Math.min(100, fill * 100)}%"></div></div></div>
    <div class="stat"><small>Средний простой</small><b>${avgDwell} <span>мин</span></b></div>
    <div class="stat"><small>Отгружено сегодня</small><b>${s.stats.outPallets} <span>палл.</span></b></div>
    <div class="stat"><small>Принято сегодня</small><b>${s.stats.inPallets} <span>палл.</span></b></div>
  </div>
  <div class="actions"><button class="btn primary" data-act="newOut">⇡ Новая отгрузка</button><button class="btn" data-act="newIn">⇣ Ожидаемая поставка</button></div>
  <h4>Номенклатура <span class="muted">палл.</span></h4>
  <div class="rows">${inventoryRows(s)}</div>
  <h4>Погрузчики</h4>
  <div class="rows">${s.forklifts.map((f) => `<div class="r click" data-fork="${f.id}"><b>${f.id}</b><span class="k">${forkStatus(f).text}</span><span class="v" style="width:60px"><div class="bar ${f.battery < 25 ? 'red' : 'green'}"><div style="width:${f.battery}%"></div></div></span></div>`).join('')}</div>
  <h4>Диспетчеризация</h4>
  <div class="toggle">Автоназначение ворот<button class="switch ${world.autoDispatch ? 'on' : ''}" data-act="autoDispatch"></button></div>
  <div class="toggle">Автогенерация рейсов<button class="switch ${world.autoSpawn ? 'on' : ''}" data-act="autoSpawn"></button></div>
  <p class="muted">Выключите автоназначение, чтобы самостоятельно расставлять машины по воротам — как в стратегии: выберите машину в очереди и нажмите на свободные ворота.</p>`;
}

function forkStatus(f) {
  const map = {
    idle: ['Свободен', 'gray'], toPick: [f.truck ? (f.truck.inbound ? 'Едет к машине' : 'Едет в буфер') : 'В пути', 'blue'],
    picking: ['Захват паллеты', 'blue'], carrying: [f.truck?.inbound ? 'Везёт в буфер' : 'Везёт в машину', 'green'],
    dropping: ['Укладка', 'green'], toCharge: ['Едет на зарядку', 'amber'], charging: ['Заряжается', 'amber'],
  };
  const [text, cls] = map[f.state] || [f.state, 'gray'];
  return { text, cls };
}

function detailTruck(t) {
  const st = truckStatus(t);
  const now = world.time;
  const left = Math.round(t.deadline - now);
  const p = t.pallets ? t.done / t.pallets : 0;
  const late = left < 0;
  const freeDocks = site.docks.filter((d) => !d.truck);
  const remain = Math.max(0, Math.round((t.pallets - t.done) * 1.4));
  return `
  <div class="d-head"><div class="d-ic">⛟</div><div><div class="d-kicker">${t.inbound ? 'Поставка' : 'Отгрузка'} · ${site.id}</div><div class="d-title">${t.id}</div><div class="d-sub">${esc(t.carrier.name)} · ${t.shipment.id}</div></div><button class="d-close" data-act="close">✕</button></div>
  <div class="chips"><span class="chip ${st.cls}">● ${st.text}</span>${late ? '<span class="chip red">Опаздывает</span>' : `<span class="chip">окно ${left} мин</span>`}</div>
  <div class="grid2">
    <div class="stat"><small>${t.inbound ? 'Разгружено' : 'Загружено'}</small><b>${t.done} <span>/ ${t.pallets} палл.</span></b><div class="bar ${t.inbound ? 'amber' : 'green'}"><div style="width:${p * 100}%"></div></div></div>
    <div class="stat"><small>Осталось</small><b>${t.state === 'docked' ? remain : '—'} <span>мин</span></b></div>
  </div>
  <div class="rows">
    <div class="r"><span class="k">Груз</span><span class="v">${swatch(t.sku)}</span><span class="v">${esc(SKUS[t.sku].name)}</span></div>
    <div class="r"><span class="k">${t.inbound ? 'Поставщик' : 'Получатель'}</span><span class="v">${esc(t.shipment.party)}</span></div>
    <div class="r"><span class="k">Ворота</span><span class="v">${t.dock ? t.dock.id : '—'}</span></div>
    <div class="r"><span class="k">Прибыл</span><span class="v">${t.arrivedAt ? fmtTime(t.arrivedAt) : '—'}</span></div>
    <div class="r"><span class="k">Встал под погрузку</span><span class="v">${t.dockedAt ? fmtTime(t.dockedAt) : '—'}</span></div>
    <div class="r"><span class="k">Плановое убытие до</span><span class="v" style="color:${late ? 'var(--red)' : ''}">${fmtTime(t.deadline)}</span></div>
    <div class="r"><span class="k">Простой</span><span class="v">${t.arrivedAt ? Math.round(now - t.arrivedAt) + ' мин' : '—'}</span></div>
  </div>
  ${t.state === 'waiting' || t.state === 'arriving' ? `<h4>Назначить ворота</h4><div class="actions">${site.docks.map((d) => `<button class="btn ${d.truck ? '' : 'primary'}" data-dock="${d.idx}" ${d.truck ? 'disabled' : ''}>${d.id}${d.truck ? ' · занято' : ''}</button>`).join('')}</div>${freeDocks.length ? '' : '<p class="muted">Все ворота заняты — машина ждёт в очереди.</p>'}` : ''}
  <div class="actions"><button class="btn" data-act="focus">◎ Показать на карте</button></div>`;
}

function detailFork(f) {
  const st = forkStatus(f);
  return `
  <div class="d-head"><div class="d-ic y">⚙</div><div><div class="d-kicker">Погрузчик · ${site.id}</div><div class="d-title">${f.id}</div><div class="d-sub">${esc(f.driver)} · ${esc(f.model)}</div></div><button class="d-close" data-act="close">✕</button></div>
  <div class="chips"><span class="chip ${st.cls}">● ${st.text}</span>${f.truck ? `<span class="chip blue">${f.truck.inbound ? 'Разгрузка' : 'Погрузка'} ${f.truck.id}</span>` : ''}</div>
  <div class="grid2">
    <div class="stat"><small>Заряд</small><b>${Math.round(f.battery)}<span>%</span></b><div class="bar ${f.battery < 25 ? 'red' : 'green'}"><div style="width:${f.battery}%"></div></div></div>
    <div class="stat"><small>Перемещений за смену</small><b>${f.moves}</b></div>
  </div>
  <div class="rows">
    <div class="r"><span class="k">Везёт</span><span class="v">${f.carrying ? swatch(f.carrying) + ' ' + esc(SKUS[f.carrying].name) : '—'}</span></div>
    <div class="r"><span class="k">Скорость</span><span class="v">${f.moving ? '8 км/ч' : '0 км/ч'}</span></div>
    <div class="r"><span class="k">Зона</span><span class="v">${f.dock ? f.dock.id : f.state === 'charging' || f.state === 'toCharge' ? 'Зарядная станция' : 'Стоянка'}</span></div>
    <div class="r"><span class="k">Площадка</span><span class="v">${site.id} · ${esc(site.cfg.name)}</span></div>
  </div>
  <div class="actions"><button class="btn" data-act="charge" ${f.state === 'idle' ? '' : 'disabled'}>⚡ На зарядку</button><button class="btn" data-act="focus">◎ Показать на карте</button></div>`;
}

function detailDock(i) {
  const d = site.docks[i], t = d.truck;
  const waiting = site.trucks.filter((x) => x.state === 'waiting' || x.state === 'arriving');
  const forks = site.forklifts.filter((f) => f.dock === d);
  return `
  <div class="d-head"><div class="d-ic">▭</div><div><div class="d-kicker">Ворота · ${site.id}</div><div class="d-title">${d.id}</div><div class="d-sub">Докшелтер, уравнительная платформа</div></div><button class="d-close" data-act="close">✕</button></div>
  <div class="chips"><span class="chip ${t ? 'amber' : 'green'}">● ${t ? 'Занято' : 'Свободно'}</span>${forks.length ? `<span class="chip blue">${forks.map((f) => f.id).join(', ')}</span>` : ''}</div>
  ${t ? `<div class="rows"><div class="r click" data-truck="${t.id}"><b>${t.id}</b><span class="k">${truckStatus(t).text}</span><span class="v">›</span></div></div>` : ''}
  ${!t && waiting.length ? `<h4>Поставить машину</h4><div class="rows">${waiting.map((w) => `<div class="r click" data-assign="${w.id}"><span class="dot ${w.inbound ? 'amber' : 'blue'}"></span><b>${w.id}</b><span class="k">${w.inbound ? 'поставка' : 'отгрузка'} · ${w.pallets} палл. · до ${fmtTime(w.deadline)}</span><span class="v">⇥</span></div>`).join('')}</div>` : ''}
  ${!t && !waiting.length ? '<p class="muted">Очередь пуста. Создайте рейс, чтобы задействовать ворота.</p><div class="actions"><button class="btn primary" data-act="newOut">⇡ Новая отгрузка</button><button class="btn" data-act="newIn">⇣ Поставка</button></div>' : ''}`;
}

function detailStock() {
  const s = site;
  return `
  <div class="d-head"><div class="d-ic">▦</div><div><div class="d-kicker">Зона хранения · ${s.id}</div><div class="d-title">Остатки и буфер</div><div class="d-sub">${nf.format(s.totalStock)} палл. из ${nf.format(s.cfg.capacity)}</div></div><button class="d-close" data-act="close">✕</button></div>
  <div class="rows">${Object.keys(s.stock).map((k) => {
    const st = stockStatus(s, k);
    const pct = Math.min(100, (s.stock[k] / (s.min[k] * 2.5)) * 100);
    return `<div class="r" style="flex-wrap:wrap">${swatch(k)}<span class="k" style="color:var(--ink)">${esc(SKUS[k].name)}</span><span class="v">${nf.format(s.stock[k])}</span><span class="chip ${st.c}">${st.t}</span>
      <div style="flex-basis:100%;display:flex;gap:8px;align-items:center"><div class="bar ${st.c === 'green' ? 'green' : st.c}" style="flex:1;margin:0"><div style="width:${pct}%"></div></div><span class="muted">мин. ${s.min[k]}</span><button class="btn ghost" style="padding:3px 8px" data-restock="${k}">＋ Пополнить</button></div></div>`;
  }).join('')}</div>`;
}

let lastDetail = '';
function renderDetail(force) {
  let html;
  const r = selected;
  if (!r || r.kind === 'site') html = detailSite();
  else if (r.kind === 'truck') { const t = site.trucks.find((x) => x.id === r.id); html = t ? detailTruck(t) : (selected = null, scene.setSelected(null), detailSite()); }
  else if (r.kind === 'forklift') html = detailFork(site.forklifts.find((x) => x.id === r.id));
  else if (r.kind === 'dock') html = detailDock(r.idx);
  else if (r.kind === 'stock') html = detailStock();
  if (!force && html === lastDetail) return;
  // не перерисовываем, если пользователь держит курсор над кнопкой (чтобы клики не терялись)
  const el = $('#detail');
  if (!force && el.matches(':hover') && el.querySelector('button:hover')) return;
  lastDetail = html;
  const sc = el.scrollTop;
  el.innerHTML = html;
  el.scrollTop = sc;
}

$('#detail').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act],[data-dock],[data-truck],[data-assign],[data-fork],[data-sku],[data-restock]');
  if (!b) return;
  const d = b.dataset;
  if (d.act === 'close') select(null);
  else if (d.act === 'focus') select(selected, true);
  else if (d.act === 'newOut') openOrder('out');
  else if (d.act === 'newIn') openOrder('in');
  else if (d.act === 'autoDispatch') { world.autoDispatch = !world.autoDispatch; toast(world.autoDispatch ? 'Автоназначение ворот включено' : 'Ручная диспетчеризация: назначайте ворота сами'); }
  else if (d.act === 'autoSpawn') world.autoSpawn = !world.autoSpawn;
  else if (d.act === 'charge') { const f = site.forklifts.find((x) => x.id === selected.id); site.goCharge(f); }
  else if (d.dock != null) { const t = site.trucks.find((x) => x.id === selected.id); if (site.assignDock(t, site.docks[+d.dock])) toast(`${t.id} → ${site.docks[+d.dock].id}`, 'ok'); }
  else if (d.assign) { const t = site.trucks.find((x) => x.id === d.assign); const dk = site.docks[selected.idx]; if (site.assignDock(t, dk)) { toast(`${t.id} → ${dk.id}`, 'ok'); select({ kind: 'truck', id: t.id }); } }
  else if (d.truck) select({ kind: 'truck', id: d.truck }, true);
  else if (d.fork) select({ kind: 'forklift', id: d.fork }, true);
  else if (d.sku) select({ kind: 'stock' }, true);
  else if (d.restock) openOrder('in', d.restock);
  refresh(true);
});
$('#detailToggle').onclick = () => { const o = $('#detail').classList.toggle('open'); $('#detailToggle').textContent = o ? 'Скрыть ▾' : 'Детали ▴'; };

// ---------- отслеживание отгрузки ----------
function renderTracking() {
  let t = selected?.kind === 'truck' ? site.trucks.find((x) => x.id === selected.id) : null;
  if (!t && selected?.kind === 'dock') t = site.docks[selected.idx].truck;
  if (!t) t = site.trucks.find((x) => x.state === 'docked') || site.trucks.find((x) => x.state !== 'departing') || site.trucks[0];
  const el = $('#tracking');
  if (!t) { el.innerHTML = '<div class="tr-main"><div class="tr-head">Отслеживание рейсов<span>нет активных рейсов</span></div></div>'; return; }
  const s = t.shipment.steps;
  const op = t.inbound ? 'Разгрузка' : 'Погрузка';
  const steps = t.inbound
    ? [['Создан', s.confirmed], ['Прибыл', s.arrived], ['Встал к воротам', s.docked], [`${op} ${t.done}/${t.pallets}`, s.loaded, s.loading || s.docked], ['Размещено', s.stored]]
    : [['Заказ подтверждён', s.confirmed], ['Прибыл', s.arrived], ['Собран', s.picked], [`${op} ${t.done}/${t.pallets}`, s.loaded, s.loading || s.docked], ['В пути', s.transit]];
  let cur = steps.findIndex((x) => !x[1]);
  if (cur < 0) cur = steps.length;
  const html = `
  <div class="tr-main">
    <div class="tr-head">Отслеживание рейса<span>${t.id} · ${esc(t.carrier.name)}</span></div>
    <div class="steps">${steps.map((x, i) => `<div class="step ${i < cur ? 'done' : i === cur ? 'cur' : ''}"><div class="c">${i < cur ? '✓' : i + 1}</div><b>${x[0]}</b><small>${x[1] ? fmtTime(x[1]) : x[2] && i === cur ? 'идёт' : 'ожидается'}</small></div>`).join('')}</div>
  </div>
  <div class="tr-card" data-truck="${t.id}">
    <b>${t.shipment.id}</b>
    <span class="muted">${t.inbound ? 'От' : 'Кому'}: ${esc(t.shipment.party)} → ${t.inbound ? site.id : ''}</span>
    <span class="chip ${truckStatus(t).cls}" style="align-self:flex-start">${truckStatus(t).text}</span>
    <span class="muted">${site.id} · ${t.dock ? t.dock.id : 'очередь'} · ${t.state === 'docked' ? Math.round((t.pallets - t.done) * 1.4) + ' мин осталось' : 'окно до ' + fmtTime(t.deadline)}</span>
  </div>`;
  if (el._h !== html) { el.innerHTML = html; el._h = html; }
}
$('#tracking').addEventListener('click', (e) => { const c = e.target.closest('[data-truck]'); if (c) select({ kind: 'truck', id: c.dataset.truck }, true); });

// ---------- таблица ворот / техники ----------
$$('#fleetTabs button').forEach((b) => (b.onclick = () => { fleetTab = b.dataset.t; $$('#fleetTabs button').forEach((x) => x.classList.toggle('on', x === b)); renderFleet(); }));
function renderFleet() {
  const s = site;
  const tabs = $$('#fleetTabs span');
  tabs[0].textContent = `${s.docks.filter((d) => d.truck).length}/${s.docks.length}`;
  tabs[1].textContent = `${s.forklifts.filter((f) => f.state !== 'idle').length}/${s.forklifts.length}`;
  tabs[2].textContent = s.trucks.length;
  let rows = '';
  if (fleetTab === 'docks') {
    rows = s.docks.map((d) => {
      const t = d.truck;
      const sel = selected?.kind === 'dock' && selected.idx === d.idx;
      return `<tr data-k="dock" data-v="${d.idx}" class="${sel ? 'sel' : ''}"><td><b>${d.id}</b><small>${s.id}</small></td><td>${t ? `<span class="dot ${truckStatus(t).cls}"></span> ${t.id}<small>${esc(t.carrier.name)}</small>` : '<span class="muted">Машина не назначена</span>'}</td><td>${t ? `<span class="chip ${truckStatus(t).cls}">${truckStatus(t).short}</span>` : '<span class="chip green">свободно</span>'}</td></tr>`;
    }).join('');
  } else if (fleetTab === 'forks') {
    rows = s.forklifts.map((f) => {
      const st = forkStatus(f);
      return `<tr data-k="forklift" data-v="${f.id}" class="${selected?.id === f.id ? 'sel' : ''}"><td><b>${f.id}</b><small>${esc(f.driver)}</small></td><td><span class="chip ${st.cls}">${st.text}</span></td><td>${Math.round(f.battery)}%<small>${f.moves} перем.</small></td></tr>`;
    }).join('');
  } else {
    rows = s.trucks.map((t) => {
      const st = truckStatus(t);
      return `<tr data-k="truck" data-v="${t.id}" class="${selected?.id === t.id ? 'sel' : ''}"><td><b>${t.id}</b><small>${esc(t.carrier.name)}</small></td><td>${t.inbound ? '⇣ поставка' : '⇡ отгрузка'}<small>${t.pallets} палл. · ${esc(SKUS[t.sku].name)}</small></td><td><span class="chip ${st.cls}">${st.short}</span><small>${t.dock ? t.dock.id : ''}</small></td></tr>`;
    }).join('') || '<tr><td class="muted">Нет машин</td></tr>';
  }
  const html = `<table class="ft">${rows}</table>`;
  const el = $('#fleetBody');
  if (el._h !== html) { el.innerHTML = html; el._h = html; }
}
$('#fleetBody').addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-k]'); if (!tr) return;
  const k = tr.dataset.k, v = tr.dataset.v;
  select(k === 'dock' ? { kind: 'dock', idx: +v } : { kind: k, id: v }, true);
});

// ---------- модалки ----------
function closeModals() { $$('.modal').forEach((m) => m.classList.add('hidden')); }
$$('.modal').forEach((m) => m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-close]')) closeModals(); }));

let orderType = 'out';
function openOrder(type, sku) {
  orderType = type;
  $$('#orderType button').forEach((b) => b.classList.toggle('on', b.dataset.v === type));
  $('#orderSku').innerHTML = Object.keys(site.stock).map((k) => `<option value="${k}" ${k === sku ? 'selected' : ''}>${esc(SKUS[k].name)} — ${site.stock[k]} палл.</option>`).join('');
  updateOrderForm();
  $('#orderModal').classList.remove('hidden');
}
function updateOrderForm() {
  const out = orderType === 'out';
  $('#orderTitle').textContent = `${out ? 'Новая отгрузка' : 'Ожидаемая поставка'} · ${site.id}`;
  $('#partyLbl').firstChild.textContent = out ? 'Получатель' : 'Поставщик';
  $('#orderParty').placeholder = out ? CITIES[0] : SUPPLIERS[0];
  const k = $('#orderSku').value;
  $('#orderHint').textContent = out ? `Доступно к отгрузке: ${site.stock[k]} палл.` : `Текущий остаток: ${site.stock[k]} палл., минимум ${site.min[k]}.`;
}
$$('#orderType button').forEach((b) => (b.onclick = () => { orderType = b.dataset.v; $$('#orderType button').forEach((x) => x.classList.toggle('on', x === b)); updateOrderForm(); }));
$('#orderSku').onchange = updateOrderForm;
$('#orderForm').onsubmit = (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const pallets = Math.max(1, Math.min(20, +f.get('pallets') || 8));
  const sku = f.get('sku');
  if (orderType === 'out' && site.stock[sku] < pallets) { toast(`Недостаточно остатка: ${site.stock[sku]} палл.`, 'warn'); return; }
  const t = site.spawnTruck({ inbound: orderType === 'in', sku, pallets, window: +f.get('window') || 90, party: f.get('party') || undefined });
  closeModals();
  toast(`Создан рейс ${t.id} · ${t.shipment.id}`, 'ok');
  select({ kind: 'truck', id: t.id });
};

// ---------- отчёты ----------
let repScope = 'site', repFilter = '';
$('#reportsBtn').onclick = () => { $('#reports').classList.remove('hidden'); renderReports(); };
$$('#repScope button').forEach((b) => (b.onclick = () => { repScope = b.dataset.v; $$('#repScope button').forEach((x) => x.classList.toggle('on', x === b)); renderReports(); }));
$$('#repFilter button').forEach((b) => (b.onclick = () => { repFilter = b.dataset.v; $$('#repFilter button').forEach((x) => x.classList.toggle('on', x === b)); renderReports(); }));
const scopeSites = () => (repScope === 'all' ? world.sites : [site]);

function renderReports() {
  const ss = scopeSites();
  const sum = (f) => ss.reduce((a, s) => a + f(s), 0);
  const served = sum((s) => s.stats.served), onTime = sum((s) => s.stats.onTime);
  const dw = ss.flatMap((s) => s.stats.dwell);
  const k = [
    ['Принято', sum((s) => s.stats.inPallets), 'палл.'],
    ['Отгружено', sum((s) => s.stats.outPallets), 'палл.'],
    ['Обслужено машин', served, ''],
    ['Средний простой', dw.length ? Math.round(dw.reduce((a, b) => a + b, 0) / dw.length) : 0, 'мин'],
    ['Вовремя', served ? ((onTime / served) * 100).toFixed(1).replace('.', ',') : '100', '%'],
  ];
  $('#repKpis').innerHTML = k.map(([a, b, c]) => `<div class="stat"><small>${a}</small><b>${typeof b === 'number' ? nf.format(b) : b} <span>${c}</span></b></div>`).join('');
  // остатки
  $('#repStock').innerHTML = ss.map((s) => `${ss.length > 1 ? `<h4>${s.id} · ${esc(s.cfg.name)}</h4>` : ''}<div class="rows">${inventoryRows(s, false)}</div>`).join('');
  // журнал
  const rows = ss.flatMap((s) => s.journal).filter((j) => !repFilter || j.type === repFilter).sort((a, b) => b.t - a.t).slice(0, 200);
  const names = { arrive: 'Прибытие', unload: 'Разгрузка', load: 'Погрузка', depart: 'Убытие', dock: 'Ворота', assign: 'Назначение', plan: 'План' };
  $('#repJournal').innerHTML = `<table><tr><th>Время</th><th>Склад</th><th>Тип</th><th>Рейс</th><th>Событие</th><th>Палл.</th></tr>${rows.map((j) => `<tr><td>${fmtTime(j.t)}</td><td>${j.site}</td><td><span class="jt ${j.type}">${names[j.type] || j.type}</span></td><td>${j.ref}</td><td>${esc(j.text)}</td><td>${j.pallets || ''}</td></tr>`).join('')}</table>`;
  drawChart(ss);
}

function drawChart(ss) {
  const c = $('#repChart');
  const dpr = window.devicePixelRatio || 1;
  const W = c.clientWidth, H = 180;
  c.width = W * dpr; c.height = H * dpr;
  const g = c.getContext('2d'); g.scale(dpr, dpr);
  const h1 = Math.floor(world.time / 60);
  const hours = []; for (let h = 6; h <= Math.max(h1, 12); h++) hours.push(h);
  const data = hours.map((h) => ss.reduce((a, s) => { const b = s.stats.hourly[h]; return { in: a.in + (b?.in || 0), out: a.out + (b?.out || 0) }; }, { in: 0, out: 0 }));
  const max = Math.max(10, ...data.map((d) => Math.max(d.in, d.out)));
  const L = 28, B = 22, cw = (W - L) / hours.length;
  g.font = '10px Inter, Arial'; g.fillStyle = '#6b7690'; g.strokeStyle = '#eef1f6';
  for (let i = 0; i <= 4; i++) {
    const y = 8 + (H - B - 8) * (1 - i / 4);
    g.beginPath(); g.moveTo(L, y); g.lineTo(W, y); g.stroke();
    g.fillText(Math.round((max * i) / 4), 2, y + 3);
  }
  data.forEach((d, i) => {
    const x = L + i * cw + cw * 0.18, bw = cw * 0.3;
    const hIn = ((H - B - 8) * d.in) / max, hOut = ((H - B - 8) * d.out) / max;
    g.fillStyle = '#f59e0b'; roundRect(g, x, H - B - hIn, bw, hIn);
    g.fillStyle = '#2f5be0'; roundRect(g, x + bw + 2, H - B - hOut, bw, hOut);
    g.fillStyle = hours[i] === h1 ? '#18213a' : '#6b7690';
    g.fillText(String(hours[i]).padStart(2, '0') + ':00', L + i * cw + cw / 2 - 13, H - 6);
  });
}
function roundRect(g, x, y, w, h) { if (h <= 0) return; const r = Math.min(3, w / 2, h); g.beginPath(); g.moveTo(x, y + h); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r); g.lineTo(x + w, y + h); g.fill(); }

function downloadCsv(name, rows) {
  const csv = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
  // копируем в буфер (работает и там, где скачивание файлов запрещено) и пробуем скачать
  navigator.clipboard?.writeText(csv).then(() => toast(`${name}: CSV скопирован в буфер обмена`, 'ok'), () => {});
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch {}
}
$('#csvJournal').onclick = () => {
  const rows = scopeSites().flatMap((s) => s.journal).sort((a, b) => a.t - b.t);
  downloadCsv(`журнал_${repScope === 'all' ? 'все' : site.id}.csv`, [['Время', 'Склад', 'Тип', 'Рейс', 'Событие', 'Паллет', 'Товар'], ...rows.map((j) => [fmtTime(j.t), j.site, j.type, j.ref, j.text, j.pallets || '', j.sku ? SKUS[j.sku].name : ''])]);
};
$('#csvStock').onclick = () => {
  const rows = scopeSites().flatMap((s) => Object.keys(s.stock).map((k) => [s.id, s.cfg.name, k, SKUS[k].name, s.stock[k], s.min[k], stockStatus(s, k).t]));
  downloadCsv('остатки.csv', [['Склад', 'Название', 'Код', 'Товар', 'Остаток, палл.', 'Минимум', 'Статус'], ...rows]);
};

// ---------- цикл ----------
function refresh(force = false) {
  $('#clock').textContent = fmtTime(world.time);
  renderKpis();
  renderDetail(force);
  renderTracking();
  renderFleet();
  if (force || Math.random() < 0.1) renderSiteBtn();
  if (!$('#reports').classList.contains('hidden') && (force || Math.random() < 0.15)) renderReports();
}

setSite(site);
renderBell();
let last = performance.now(), acc = 0;
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  world.update(dt);
  scene.render(dt, now / 1000);
  acc += dt;
  if (acc > 0.25) { acc = 0; refresh(); }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
window.__app = { world, scene, get site() { return site; } };
