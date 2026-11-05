// Справочные данные прототипа: склады, номенклатура, перевозчики, персонал.

export const SKUS = {
  BOX: { name: 'Картонная коробка (M)', color: 0xd9a066, unit: 'палл.' },
  PLC: { name: 'Пластиковый контейнер', color: 0x3b6cf0, unit: 'палл.' },
  HLM: { name: 'Защитная каска', color: 0xf5a524, unit: 'палл.' },
  TAP: { name: 'Упаковочная лента', color: 0xc98b4f, unit: 'палл.' },
  LED: { name: 'LED-панель 60×60', color: 0xe8b06a, unit: 'палл.' },
  CHR: { name: 'Офисное кресло', color: 0xb88452, unit: 'палл.' },
  GLV: { name: 'Нитриловые перчатки', color: 0x2f55d4, unit: 'палл.' },
};

export const CARRIERS = [
  { name: 'Синяя Линия', cab: 0x2850e8, stripe: 0x2850e8 },
  { name: 'ВелесТранс', cab: 0xf4f6fb, stripe: 0xf08a24 },
  { name: 'Норд Карго', cab: 0x1d2b5c, stripe: 0x1d2b5c },
  { name: 'Быстрый Путь', cab: 0xf4f6fb, stripe: 0x14b8a6 },
];

export const CITIES = ['Москва', 'Тверь', 'Казань', 'Нижний Новгород', 'Ярославль', 'Владимир', 'Рязань', 'Тула'];
export const SUPPLIERS = ['ООО «Упакпром»', 'ПластТех', 'СИЗ-Опт', 'ЛайтСистемс', 'МебельПро', 'МедСнаб'];

export const SITES = [
  {
    id: 'WH-01',
    kind: 'Распределительный центр',
    name: 'Речной хаб',
    address: 'ул. Речная, 12, Тверь',
    docks: 3,
    capacity: 1800,
    building: { w: 46, d: 24, h: 9 },
    forklifts: [
      { id: 'FL-01', driver: 'С. Хадыров', model: 'Toyota 8FBE' },
      { id: 'FL-02', driver: 'А. Ким', model: 'Linde E20' },
      { id: 'FL-06', driver: 'Р. Гусев', model: 'Still RX20' },
    ],
    stock: { BOX: 412, PLC: 268, HLM: 212, TAP: 236, GLV: 284 },
    min: { BOX: 150, PLC: 120, HLM: 240, TAP: 100, GLV: 120 },
    seed: 11,
  },
  {
    id: 'WH-02',
    kind: 'Склад ответственного хранения',
    name: 'Северный DC',
    address: 'Северное ш., 480, Москва',
    docks: 4,
    capacity: 4200,
    building: { w: 60, d: 26, h: 11 },
    forklifts: [
      { id: 'FL-03', driver: 'И. Петров', model: 'Jungheinrich EFG' },
      { id: 'FL-04', driver: 'М. Орлова', model: 'Toyota 8FBE' },
      { id: 'FL-05', driver: 'Д. Саидов', model: 'Linde E20' },
      { id: 'FL-07', driver: 'Е. Волкова', model: 'Still RX20' },
    ],
    stock: { LED: 640, CHR: 512, BOX: 993, GLV: 820, TAP: 345 },
    min: { LED: 200, CHR: 150, BOX: 1000, GLV: 300, TAP: 120 },
    seed: 23,
  },
];
