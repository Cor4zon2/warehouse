// Симуляция склада: грузовики, ворота, погрузчики, остатки, журнал.
// Модуль не знает о 3D — он только хранит координаты (x, z, heading),
// а сцена синхронизирует с ними меши.

import { SITES, SKUS, CARRIERS, CITIES, SUPPLIERS } from './data.js';

const TRUCK_SPEED = 11;    // ед./сек симуляции
const FORK_SPEED = 13;
const PICK_TIME = 0.9;     // сек на захват/укладку паллеты
const MINUTES_PER_SEC = 1; // 1 сек при x1 = 1 мин складского времени

let rngState = 7;
function rnd() { rngState = (rngState * 16807) % 2147483647; return (rngState - 1) / 2147483646; }
const pick = (a) => a[Math.floor(rnd() * a.length)];
const randInt = (a, b) => a + Math.floor(rnd() * (b - a + 1));

export function fmtTime(min) {
  const m = Math.floor(min) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  return a + d * Math.min(1, t);
}

// Продвигает объект по списку точек. Возвращает true, когда путь пройден.
function followPath(o, speed, dt) {
  let left = speed * dt;
  while (left > 0 && o.path.length) {
    const wp = o.path[0];
    const dx = wp.x - o.x, dz = wp.z - o.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.01) {
      let dir = Math.atan2(-dz, dx); // heading: 0 = +x, против часовой, если смотреть сверху
      if (wp.rev) dir += Math.PI;
      o.heading = angleLerp(o.heading, dir, dt * (wp.rev ? 3.2 : 4.5));
    }
    if (dist <= left) { o.x = wp.x; o.z = wp.z; left -= dist; o.path.shift(); }
    else { o.x += (dx / dist) * left; o.z += (dz / dist) * left; left = 0; }
  }
  o.moving = o.path.length > 0;
  return !o.path.length;
}

class Site {
  constructor(cfg, world) {
    this.cfg = cfg;
    this.world = world;
    this.id = cfg.id;
    const { w, d } = cfg.building;
    this.roadZ = d / 2 + 30;
    this.laneZ = this.roadZ + 6;
    this.dockZ = d / 2;
    this.docks = Array.from({ length: cfg.docks }, (_, i) => ({
      id: `Ворота ${i + 1}`, idx: i,
      x: -w / 2 + ((i + 1) * w) / (cfg.docks + 1),
      truck: null, door: 0,
    }));
    this.staging = { x: -w / 2 - 10, z: d / 2 - 5.8 };
    this.charger = { x: w / 2 + 6, z: -d / 2 + 4 };
    this.forklifts = cfg.forklifts.map((f, i) => ({
      ...f, kind: 'forklift',
      x: w / 2 + 4, z: d / 2 - 3 - i * 3.6, heading: Math.PI,
      home: { x: w / 2 + 4, z: d / 2 - 3 - i * 3.6 },
      state: 'idle', battery: 92 - i * 9, moves: 0, carrying: null, dock: null, path: [], timer: 0,
    }));
    this.stock = { ...cfg.stock };
    this.min = { ...cfg.min };
    this.trucks = [];
    this.shipments = [];
    this.journal = [];
    this.stats = { inPallets: 0, outPallets: 0, served: 0, onTime: 0, dwell: [], hourly: {} };
    this.nextSpawn = 2 + cfg.docks;
    this.seq = cfg.id === 'WH-01' ? 2050 : 2120;
    this.shpSeq = cfg.id === 'WH-01' ? 78440 : 78470;
    // стартовая история за смену, чтобы отчёты не были пустыми
    this.seedHistory();
  }

  get totalStock() { return Object.values(this.stock).reduce((a, b) => a + b, 0); }
  get onSite() { return this.trucks.filter((t) => t.state !== 'gone' && t.state !== 'arriving').length; }

  seedHistory() {
    const start = this.world.time - 120;
    const n = 4 + (this.cfg.docks - 3) * 2;
    for (let i = 0; i < n; i++) {
      const t0 = start + i * (100 / n);
      const inbound = i % 2 === 0;
      const sku = pick(Object.keys(this.stock));
      const pallets = randInt(6, 12);
      const id = `TRK-${this.seq++}`;
      const dwell = randInt(28, 55);
      this.log(t0, 'arrive', id, `${id} прибыл на площадку`, 0, sku);
      this.log(t0 + 4, inbound ? 'unload' : 'load', id, `${id}: ${inbound ? 'разгрузка' : 'погрузка'} ${pallets} палл. «${SKUS[sku].name}»`, pallets, sku, inbound);
      this.log(t0 + dwell, 'depart', id, `${id} убыл с площадки`, 0, sku);
      if (inbound) this.stats.inPallets += pallets; else this.stats.outPallets += pallets;
      this.stats.served++; this.stats.dwell.push(dwell);
      if (rnd() > 0.06) this.stats.onTime++;
    }
  }

  log(t, type, ref, text, pallets = 0, sku = null, inbound = null) {
    this.journal.unshift({ t, type, ref, text, pallets, sku, site: this.id });
    if (pallets) {
      const h = Math.floor(t / 60);
      const b = (this.stats.hourly[h] ||= { in: 0, out: 0 });
      if (inbound) b.in += pallets; else b.out += pallets;
    }
    if (this.journal.length > 400) this.journal.pop();
    this.world.emit('log', { site: this, entry: this.journal[0] });
  }

  // ---- создание рейсов ----
  spawnTruck(opts = {}) {
    const inbound = opts.inbound ?? rnd() < 0.55;
    const skus = Object.keys(this.stock);
    let sku = opts.sku;
    if (!sku) {
      if (inbound) {
        // приоритет — позиции с низким остатком
        const low = skus.filter((s) => this.stock[s] < this.min[s]);
        sku = low.length && rnd() < 0.7 ? pick(low) : pick(skus);
      } else {
        const ok = skus.filter((s) => this.stock[s] > 30);
        if (!ok.length) return null;
        sku = pick(ok);
      }
    }
    const pallets = opts.pallets ?? randInt(4, 10);
    const carrier = opts.carrier ?? pick(CARRIERS);
    const t = this.world.time;
    const truck = {
      kind: 'truck', id: `TRK-${this.seq++}`, inbound, sku, pallets, done: 0, reserved: 0,
      carrier, x: -130 - rnd() * 20, z: this.laneZ, heading: 0, path: [], moving: true,
      state: 'arriving', dock: null, created: t, arrivedAt: null, dockedAt: null, departedAt: null,
      deadline: t + (opts.window ?? randInt(100, 150)),
      waitSlot: null,
    };
    const shp = {
      id: `#SHP-${this.shpSeq++}`, truckId: truck.id, inbound, sku, pallets,
      party: opts.party ?? (inbound ? pick(SUPPLIERS) : pick(CITIES)),
      created: t, steps: {},
    };
    shp.steps.confirmed = t;
    truck.shipment = shp;
    this.trucks.push(truck);
    this.shipments.unshift(shp);
    if (this.shipments.length > 60) this.shipments.pop();
    // едет по полосе ожидания к воротам площадки
    const slot = this.freeWaitSlot();
    truck.waitSlot = slot;
    truck.path = [{ x: this.waitX(slot), z: this.laneZ }];
    this.log(t, 'plan', truck.id, `Создан рейс ${truck.id} (${carrier.name}): ${inbound ? 'поставка' : 'отгрузка'} ${pallets} палл. «${SKUS[sku].name}» · ${shp.id}`);
    return truck;
  }

  waitX(slot) { return -this.cfg.building.w / 2 - 22 - slot * 17; }
  freeWaitSlot() {
    const used = new Set(this.trucks.filter((t) => t.waitSlot != null).map((t) => t.waitSlot));
    let s = 0; while (used.has(s)) s++; return s;
  }

  assignDock(truck, dock) {
    if (!truck || dock.truck || !(truck.state === 'waiting' || truck.state === 'arriving')) return false;
    dock.truck = truck; truck.dock = dock; truck.waitSlot = null;
    truck.state = 'toDock';
    const R = this.roadZ, dz = this.dockZ;
    truck.path = [
      { x: dock.x + 6, z: R },
      { x: dock.x + 18, z: R - 1 },
      { x: dock.x + 22, z: R - 5 },
      { x: dock.x + 8, z: R - 12, rev: true },
      { x: dock.x, z: dz + 16, rev: true },
      { x: dock.x, z: dz + 7.6, rev: true },
    ];
    this.log(this.world.time, 'assign', truck.id, `${truck.id} назначен на ${dock.id}`);
    return true;
  }

  autoDispatch() {
    const waiting = this.trucks.filter((t) => t.state === 'waiting').sort((a, b) => a.deadline - b.deadline);
    for (const t of waiting) {
      const d = this.docks.find((x) => !x.truck);
      if (!d) break;
      this.assignDock(t, d);
    }
  }

  depart(truck) {
    const d = truck.dock;
    truck.state = 'departing';
    truck.path = [
      { x: d.x, z: this.dockZ + 18 },
      { x: d.x + 7, z: this.roadZ - 1 },
      { x: d.x + 20, z: this.roadZ },
      { x: 170, z: this.roadZ },
    ];
    d.truck = null; truck.dock = null;
    const t = this.world.time;
    truck.departedAt = t;
    const dwell = Math.round(t - truck.arrivedAt);
    this.stats.served++; this.stats.dwell.push(dwell);
    const onTime = t <= truck.deadline;
    if (onTime) this.stats.onTime++;
    truck.shipment.steps.transit = t;
    truck.shipment.eta = t + randInt(40, 160);
    if (truck.inbound) truck.shipment.steps.stored = t;
    this.log(t, 'depart', truck.id, `${truck.id} убыл · простой ${dwell} мин${onTime ? '' : ' · ОПОЗДАНИЕ'}`);
    this.world.emit('toast', { site: this, kind: onTime ? 'ok' : 'warn', text: `${truck.id} ${truck.inbound ? 'разгружен' : 'загружен'} и убыл${onTime ? '' : ' с опозданием'}` });
  }

  // ---- погрузчики ----
  dispatchForklifts() {
    const active = this.docks.filter((d) => d.truck && d.truck.state === 'docked' && d.truck.reserved < d.truck.pallets);
    for (const f of this.forklifts) {
      if (f.state !== 'idle') continue;
      if (f.battery < 22) { this.goCharge(f); continue; }
      // ворота, где меньше всего погрузчиков
      let best = null, bestN = 9;
      for (const d of active) {
        const n = this.forklifts.filter((x) => x.dock === d).length;
        if (n < 2 && n < bestN && d.truck.reserved < d.truck.pallets) { best = d; bestN = n; }
      }
      if (best) this.startTrip(f, best);
    }
  }

  truckSide(d) { return { x: d.x + 3.5, z: this.dockZ + 2.4 }; }

  // Маршрут погрузчика: из «кармана» между машинами выезжаем на проезд перед
  // кабинами, далее — к западной (буфер) или восточной (стоянка/зарядка) стороне.
  route(from, to) {
    const { w } = this.cfg.building;
    const LZ = this.dockZ + 16;
    const west = (p) => p.x < -w / 2 - 2, east = (p) => p.x > w / 2 + 1;
    const side = (p) => (west(p) ? 'w' : east(p) ? 'e' : 'f');
    const Cw = { x: -w / 2 - 5, z: LZ }, Ce = { x: w / 2 + 4, z: LZ };
    const a = side(from), b = side(to);
    if (a === b && a !== 'f') return [to];
    const path = [];
    path.push(a === 'f' ? { x: from.x, z: LZ } : a === 'w' ? Cw : Ce);
    path.push(b === 'f' ? { x: to.x, z: LZ } : b === 'w' ? Cw : Ce);
    path.push(to);
    return path;
  }
  stagingSpot(i) {
    const s = this.staging;
    return { x: s.x + ((i % 3) - 1) * 3.4, z: s.z + (Math.floor(i / 3) % 3 - 1) * 3.6 + 4.8 };
  }

  startTrip(f, d) {
    const t = d.truck;
    t.reserved++;
    f.dock = d; f.truck = t;
    const near = this.truckSide(d);
    const stg = this.stagingSpot(randInt(0, 8));
    f.state = 'toPick';
    f.pickAt = t.inbound ? near : stg;
    f.dropAt = t.inbound ? stg : near;
    f.path = this.route(f, f.pickAt);
  }

  goCharge(f) {
    f.state = 'toCharge';
    f.path = this.route(f, this.charger);
  }

  updateForklift(f, dt) {
    const arrived = followPath(f, FORK_SPEED, dt);
    if (!arrived) return;
    switch (f.state) {
      case 'toPick':
        f.state = 'picking'; f.timer = PICK_TIME; break;
      case 'picking':
        f.timer -= dt;
        if (f.timer <= 0) {
          f.carrying = f.truck.sku;
          if (!f.truck.inbound) this.stock[f.carrying] = Math.max(0, this.stock[f.carrying] - 1);
          f.state = 'carrying';
          f.path = this.route(f, f.dropAt);
        }
        break;
      case 'carrying':
        f.state = 'dropping'; f.timer = PICK_TIME; break;
      case 'dropping':
        f.timer -= dt;
        if (f.timer <= 0) this.finishMove(f);
        break;
      case 'toCharge':
        f.state = 'charging'; break;
      case 'charging':
        f.battery = Math.min(100, f.battery + dt * 3.5);
        if (f.battery >= 98) { f.state = 'idle'; f.path = this.route(f, f.home); }
        break;
      case 'idle':
        break;
    }
  }

  finishMove(f) {
    const t = f.truck;
    const sku = f.carrying;
    f.carrying = null; f.moves++; f.battery = Math.max(5, f.battery - 1.6);
    t.done++;
    if (t.inbound) {
      this.stock[sku] = (this.stock[sku] || 0) + 1;
      this.stats.inPallets++;
    } else this.stats.outPallets++;
    const h = Math.floor(this.world.time / 60);
    const b = (this.stats.hourly[h] ||= { in: 0, out: 0 });
    if (t.inbound) b.in++; else b.out++;
    if (t.done === 1) {
      t.shipment.steps.loading = this.world.time;
    }
    if (t.done >= t.pallets) {
      t.state = 'closing'; t.closeTimer = 3;
      t.shipment.steps.loaded = this.world.time;
      this.log(this.world.time, t.inbound ? 'unload' : 'load', t.id,
        `${t.id}: ${t.inbound ? 'разгружено' : 'загружено'} ${t.pallets} палл. «${SKUS[t.sku].name}»`, t.pallets, t.sku, t.inbound);
    }
    // следующий рейс или домой
    const d = f.dock;
    f.dock = null; f.truck = null;
    if (d.truck && d.truck.state === 'docked' && d.truck.reserved < d.truck.pallets && f.battery >= 22) this.startTrip(f, d);
    else { f.state = 'idle'; f.path = this.route(f, f.home); this.dispatchForklifts(); }
    this.checkLowStock(sku);
  }

  checkLowStock(sku) {
    const low = this.stock[sku] < this.min[sku];
    this._low ||= {};
    if (low && !this._low[sku]) {
      this.world.emit('toast', { site: this, kind: 'warn', text: `${this.id}: низкий остаток «${SKUS[sku].name}» — ${this.stock[sku]} палл.` });
      this.world.addAlert(this, `Низкий остаток «${SKUS[sku].name}» (${this.stock[sku]} < ${this.min[sku]})`);
    }
    this._low[sku] = low;
  }

  // ---- такт ----
  update(dt) {
    const now = this.world.time;
    this.nextSpawn -= dt * MINUTES_PER_SEC;
    if (this.nextSpawn <= 0 && this.world.autoSpawn) {
      const queue = this.trucks.filter((t) => t.state === 'waiting' || t.state === 'arriving').length;
      if (queue < 3) this.spawnTruck();
      this.nextSpawn = randInt(30, 50) * (3 / this.cfg.docks);
    }

    for (const t of this.trucks) {
      switch (t.state) {
        case 'arriving':
          if (followPath(t, TRUCK_SPEED, dt)) {
            t.state = 'waiting'; t.arrivedAt = now;
            t.shipment.steps.arrived = now;
            this.log(now, 'arrive', t.id, `${t.id} прибыл на КПП, ожидает ворота`);
          }
          break;
        case 'waiting':
          if (t.waitSlot != null) {
            // подтягиваемся в очереди
            const slot = this.trucks.filter((x) => x.state === 'waiting' && x.waitSlot < t.waitSlot).length;
            if (slot !== t.waitSlot) { t.waitSlot = slot; t.path = [{ x: this.waitX(slot), z: this.laneZ }]; }
            followPath(t, TRUCK_SPEED * 0.6, dt);
          }
          if (!t.warned && now - t.arrivedAt > 30) {
            t.warned = true;
            this.world.addAlert(this, `${t.id} ожидает ворота более 30 мин`);
          }
          break;
        case 'toDock':
          if (followPath(t, TRUCK_SPEED * 0.8, dt)) {
            t.state = 'docked'; t.dockedAt = now; t.heading = -Math.PI / 2; // кабиной к дороге (+z)
            t.shipment.steps.docked = now;
            if (!t.inbound) t.shipment.steps.picked = now;
            this.log(now, 'dock', t.id, `${t.id} встал на ${t.dock.id}, ${t.inbound ? 'разгрузка' : 'погрузка'} начата`);
          }
          break;
        case 'docked':
          break;
        case 'closing':
          t.closeTimer -= dt;
          if (t.closeTimer <= 0) this.depart(t);
          break;
        case 'departing':
          if (followPath(t, TRUCK_SPEED, dt)) t.state = 'gone';
          break;
      }
    }
    // двери ворот
    for (const d of this.docks) {
      const open = d.truck && (d.truck.state === 'docked' || d.truck.state === 'closing' ||
        (d.truck.state === 'toDock' && d.truck.path.length <= 2));
      d.door += ((open ? 1 : 0) - d.door) * Math.min(1, dt * 2.5);
    }
    // доставка отгрузок
    for (const s of this.shipments) {
      if (s.steps.transit && !s.steps.delivered && s.eta && now >= s.eta && !s.inbound) s.steps.delivered = s.eta;
    }
    this.trucks = this.trucks.filter((t) => t.state !== 'gone');
    if (this.world.autoDispatch) this.autoDispatch();
    this.dispatchForklifts();
    for (const f of this.forklifts) this.updateForklift(f, dt);
  }
}

export class World {
  constructor() {
    this.time = 8 * 60 + 40; // 08:40
    this.speed = 1;
    this.paused = false;
    this.autoDispatch = true;
    this.autoSpawn = true;
    this.listeners = {};
    this.alerts = [];
    this.sites = SITES.map((c) => { rngState = c.seed; return new Site(c, this); });
    rngState = 99;
    // стартовая загрузка площадок
    for (const s of this.sites) {
      const a = s.spawnTruck({ inbound: true });
      const b = s.spawnTruck({ inbound: false });
      // сразу ставим их в очередь у КПП
      for (const t of [a, b]) if (t) { t.x = s.waitX(t.waitSlot) + 30; }
    }
  }
  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
  emit(ev, data) { (this.listeners[ev] || []).forEach((fn) => fn(data)); }
  addAlert(site, text) {
    this.alerts.unshift({ t: this.time, site: site.id, text, read: false });
    if (this.alerts.length > 50) this.alerts.pop();
    this.emit('alert');
  }
  site(id) { return this.sites.find((s) => s.id === id); }
  update(realDt) {
    if (this.paused) return;
    const dt = Math.min(realDt, 0.1) * this.speed;
    // подшаги, чтобы на x10 не «перепрыгивать» точки
    const steps = Math.ceil(dt / 0.05);
    for (let i = 0; i < steps; i++) {
      const h = dt / steps;
      this.time += h * MINUTES_PER_SEC;
      for (const s of this.sites) s.update(h);
    }
  }
}

export { SKUS };
