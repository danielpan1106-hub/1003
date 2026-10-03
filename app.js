'use strict';
/* CNC 智慧派工系統 — 純前端，無後端 */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nk = s => String(s).trim().toLowerCase().replace(/\s+/g, '');
const fmt = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const hrs = m => (m / 60).toFixed(1);
const sel = (attrs, opts, cur) => `<select ${Object.entries(attrs).map(([k, v]) => `${k}="${esc(v)}"`).join(' ')}>${opts.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;

const TYPES = ['立式車床', '臥式車床', 'Mazak五軸車銑', 'DMG五軸銑車', '八米五軸龍門', '三軸銑床', '鉗工', '鋸床'];
const SHIFT_TYPES = ['早班', '中班', '夜班'];
const BREAK_SLOTS = 5;
const defaults = () => ({
  setup: 30, handover: 10, cap: 12, ot: true, fill: true,
  indirect: [
    { name: '刀具準備', min: 60, skill: '', on: true },
    { name: '機台保養', min: 60, skill: '', on: true },
    { name: '設備維護', min: 90, skill: '', on: true },
  ],
  breaks: {
    早班: [['10:30', '10:45'], ['12:30', '13:30'], ['15:30', '15:45'], ['17:30', '18:00']],
    中班: [['22:00', '22:15']],
    夜班: [['00:00', '00:15']],
  },
});
const MINUTE_OPTS = [0, 5, 10, 15, 20, 30, 45, 60, 90, 120];
const KINDS = ['employees', 'shifts', 'machines', 'jobs'];
const KIND_NAME = { employees: '人員', shifts: '班表', machines: '機台', jobs: '工單' };
const LABEL = { employees: '位人員', shifts: '筆班表', machines: '台機台', jobs: '張工單' };

const state = {
  employees: [], shifts: [], machines: [], jobs: [], settings: defaults(),
  warn: { employees: [], shifts: [], machines: [], jobs: [] },
  ctx: null, assign: null, indir: [], repair: { notes: [], tried: new Set() }, gDate: null, gView: 'emp',
};

/* ---------- 範例資料 ---------- */
const SAMPLE = (() => {
  const emps = [
    ['E001', '王大明', '八米五軸龍門;DMG五軸銑車;三軸銑床', 'DDDD'],
    ['E002', '李志強', 'Mazak五軸車銑;DMG五軸銑車', 'DDED'],
    ['E003', '陳建宏', '立式車床;臥式車床', 'DDDD'],
    ['E004', '林佳慧', '立式車床;臥式車床;鋸床', 'DEEE'],
    ['E005', '張雅婷', '鉗工;鋸床', 'DDDD'],
    ['E006', '黃俊傑', '八米五軸龍門;三軸銑床', 'EEEE'],
    ['E007', '吳政憲', '三軸銑床;鉗工', 'DD-D'],
    ['E008', '劉冠宇', 'Mazak五軸車銑;立式車床', 'DDDN'],
    ['E009', '蔡宗翰', '臥式車床;三軸銑床;鉗工', 'EEDD'],
    ['E010', '許淑芬', 'DMG五軸銑車;三軸銑床', 'DDND'],
    ['E011', '鄭文傑', '八米五軸龍門;鉗工', 'NNNN'],
    ['E012', '謝佩珊', '鉗工;鋸床;三軸銑床', 'EDDE'],
    ['E013', '洪國豪', '立式車床;Mazak五軸車銑;DMG五軸銑車', 'DDDD'],
    ['E014', '簡嘉宏', '臥式車床;鉗工', 'DEDN'],
  ];
  const days = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'];
  const times = { D: ['早班', '08:30', '17:30'], E: ['中班', '18:00', '02:00'], N: ['夜班', '20:00', '04:00'] };
  const shifts = [];
  emps.forEach(e => [...e[3]].forEach((c, i) => { if (c !== '-') shifts.push([e[0], days[i], ...times[c]]); }));
  const mach = [];
  const add = (p, type, n, label) => { for (let i = 1; i <= n; i++) mach.push([`${p}-${String(i).padStart(2, '0')}`, `${label} #${i}`, type]); };
  add('VTL', '立式車床', 2, '立式車床'); add('HL', '臥式車床', 2, '臥式車床');
  add('MZ', 'Mazak五軸車銑', 2, 'Mazak 五軸車銑'); add('DMG', 'DMG五軸銑車', 2, 'DMG 五軸銑車');
  add('GM', '八米五軸龍門', 1, '八米五軸龍門'); add('VM', '三軸銑床', 3, '三軸銑床');
  add('BN', '鉗工', 4, '鉗工工作台'); add('SAW', '鋸床', 1, '鋸床');
  const [a, b, c, d] = days;
  // [工單, 名稱, 工種, 指定機台, 開始日期, 開始(加工), 結束日期, 結束, 人數, 換線, 優先序]
  const jobs = [
    ['WO-1001', '起落架接頭連續粗銑（早→中→夜接力）', '八米五軸龍門', '', a, '14:00', b, '03:00', 1, 60, 3],
    ['WO-1002', '機翼肋板銑削', '三軸銑床', '', a, '09:30', '', '12:00', 1, 30, 2],
    ['WO-1003', '渦輪盤車銑', 'Mazak五軸車銑', '', a, '10:00', '', '15:00', 1, 45, 3],
    ['WO-1004', '艙門支架銑削', '三軸銑床', '', a, '09:30', '', '12:30', 1, 30, 1],
    ['WO-1005', '輪轂車削', '立式車床', '', a, '09:30', '', '14:30', 1, 30, 2],
    ['WO-1006', '軸套車削', '臥式車床', '', a, '09:30', '', '12:00', 1, 30, 2],
    ['WO-1007', '肋板鉗工去毛邊', '鉗工', '', a, '13:30', '', '16:30', 2, 10, 1],
    ['WO-1008', '毛胚下料', '鋸床', '', a, '09:30', '', '11:00', 1, 15, 2],
    ['WO-1009', '葉片精銑', 'DMG五軸銑車', '', a, '10:00', '', '16:00', 1, 45, 3],
    ['WO-1010', '襯套車削', '臥式車床', '', a, '18:30', '', '23:30', 1, 30, 1],
    ['WO-1011', '外殼連續粗銑（需無人運轉，超出工時上限）', '三軸銑床', '', a, '19:00', b, '10:30', 1, 30, 2],
    ['WO-1012', '鈦合金下料', '鋸床', '', a, '10:00', '', '11:30', 1, 15, 1],
    ['WO-1013', '引擎吊架龍門精銑', '八米五軸龍門', '', a, '11:00', '', '16:00', 2, 60, 3],
    ['WO-1014', '機匣車銑', 'Mazak五軸車銑', '', b, '09:30', '', '15:00', 1, 45, 3],
    ['WO-1015', '框架龍門銑削（需3人）', '八米五軸龍門', '', c, '09:30', '', '17:00', 3, 60, 3],
    ['WO-1016', '殼體立車', '立式車床', '', b, '09:30', '', '14:00', 1, 30, 2],
    ['WO-1017', '法蘭臥車', '臥式車床', '', b, '10:00', '', '14:00', 1, 30, 2],
    ['WO-1018', '總成鉗工組裝', '鉗工', '', b, '09:30', '', '12:00', 2, 10, 2],
    ['WO-1019', '支架銑削', '三軸銑床', '', b, '18:30', '', '23:30', 1, 30, 2],
    ['WO-1020', '夜班鉗工修整', '鉗工', '', b, '19:00', '', '22:00', 1, 10, 1],
    ['WO-1021', '五軸銑車複合加工', 'DMG五軸銑車', 'DMG-01', b, '09:30', '', '12:30', 1, 45, 2],
    ['WO-1022', '輪轂立車連續加工（早班加班接中班）', '立式車床', '', c, '15:00', d, '02:00', 1, 30, 3],
    ['WO-1023', '面板鉗工', '鉗工', '', c, '09:30', '', '12:00', 1, 10, 1],
    ['WO-1024', '鈦合金鋸切', '鋸床', '', c, '09:30', '', '12:00', 1, 15, 2],
    ['WO-1025', '三軸精銑', '三軸銑床', '', c, '13:30', '', '17:00', 1, 30, 2],
    ['WO-1026', '治具五軸加工', 'DMG五軸銑車', 'DMG-02', c, '09:30', '', '14:30', 1, 45, 2],
    ['WO-1027', '夜間鉗工', '鉗工', '', d, '21:00', '', '23:30', 1, 10, 2],
  ];
  return {
    employees: { head: ['員編', '姓名', '技能'], rows: emps.map(e => e.slice(0, 3)) },
    shifts: { head: ['員編', '日期', '班別', '上班', '下班'], rows: shifts },
    machines: { head: ['機台編號', '機台名稱', '類型'], rows: mach },
    jobs: { head: ['工單', '名稱', '工種', '指定機台', '日期', '開始', '結束日期', '結束', '人數', '換線(分)', '優先序'], rows: jobs },
  };
})();

/* ---------- CSV ---------- */
function decodeBuffer(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { /* 可能是 Big5 */ }
  try { return new TextDecoder('big5').decode(buf); } catch (e) { return new TextDecoder('utf-8').decode(buf); }
}
function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; rows.push(row); row = []; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim() !== ''));
}
function toCSV(head, rows) {
  const q = v => { v = String(v ?? ''); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  return '﻿' + [head, ...rows].map(r => r.map(q).join(',')).join('\r\n');
}
function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const SCHEMA = {
  employees: { required: ['id'], fields: { id: ['員編', '員工編號', '編號', 'ID'], name: ['姓名', '名稱', 'Name'], skills: ['技能', '技能清單', 'Skills'] } },
  shifts: { required: ['emp', 'date', 'start', 'end'], fields: { emp: ['員編', '員工編號', '編號', 'ID'], date: ['日期'], type: ['班別', '班次'], start: ['上班', '開始', '上班時間'], end: ['下班', '結束', '下班時間'] } },
  machines: { required: ['id', 'type'], fields: { id: ['機台編號', '機台', '編號', 'ID'], name: ['機台名稱', '名稱'], type: ['類型', '機台類型', '工種'] } },
  jobs: {
    required: ['id', 'type', 'date', 'start', 'end'],
    fields: {
      id: ['工單', '工單編號', '工作編號'], name: ['名稱', '品名', '工作名稱', '說明'], type: ['工種', '機台類型', '類型', '所需技能', '技能'],
      fixed: ['指定機台', '機台'], date: ['日期', '開始日期'], start: ['開始', '開始時間'], edate: ['結束日期', '完工日期'], end: ['結束', '結束時間'],
      people: ['人數', '所需人數'], setup: ['換線(分)', '換線', '換線時間', '換線分鐘'], prio: ['優先序', '優先', '優先級'],
    },
  },
};

/* ---------- 正規化 ---------- */
const splitSkills = s => String(s || '').split(/[;；、,，\/|]/).map(x => x.trim()).filter(Boolean);
function normDate(s) {
  const m = String(s).match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/); if (!m) return null;
  const d = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return isNaN(Date.parse(d)) ? null : d;
}
function normTime(s) {
  const m = String(s).match(/^(\d{1,2}):(\d{2})/); if (!m) return null;
  const h = +m[1], mi = +m[2];
  return (mi > 59 || h > 24 || (h === 24 && mi > 0)) ? null : h * 60 + mi;
}
const dayNum = d => Math.round(Date.parse(d + 'T00:00:00Z') / 86400000);
const isoOf = day => new Date(day * 86400000).toISOString().slice(0, 10);
const absMin = (d, m) => dayNum(d) * 1440 + m;
const fmtAbs = m => isoOf(Math.floor(m / 1440)).slice(5) + ' ' + fmt(m % 1440);
const shiftTypeOf = st => st >= 240 && st < 720 ? '早班' : st >= 720 && st < 1140 ? '中班' : '夜班';
function normPrio(v) {
  const t = String(v).trim();
  if (/高/.test(t)) return 3; if (/中/.test(t)) return 2; if (/低/.test(t)) return 1;
  const n = parseInt(t, 10); return n >= 1 ? Math.min(n, 3) : 2;
}
const normPeople = v => { const n = parseInt(v, 10); return n >= 1 ? Math.min(n, 6) : 1; };
const normSetup = v => { const n = parseInt(v, 10); return n >= 0 ? n : null; };
const setupOf = j => j.setup ?? state.settings.setup;
const wsOf = j => j.s - setupOf(j);                       // 換線（間接工時）開始
const jobRange = j => `${j.date} ${fmt(j.start)} → ${Math.floor(j.e / 1440) !== Math.floor(j.s / 1440) ? isoOf(Math.floor(j.e / 1440)).slice(5) + ' ' : ''}${fmt(j.e % 1440)}`;
const segTxt = (j, g) => {
  const ref = Math.floor(j.s / 1440), f = m => (Math.floor(m / 1440) === ref ? '' : isoOf(Math.floor(m / 1440)).slice(5) + ' ') + fmt(m % 1440);
  return `${f(g.a)}–${f(g.b)}`;
};

function build(kind, rows) {
  const schema = SCHEMA[kind];
  const head = rows[0].map(h => h.trim());
  const idx = {}, missing = [];
  for (const [k, al] of Object.entries(schema.fields)) {
    const i = head.findIndex(h => al.includes(h));
    idx[k] = i; if (i < 0 && schema.required.includes(k)) missing.push(al[0]);
  }
  if (missing.length) throw new Error('缺少欄位：' + missing.join('、'));
  const items = [], warn = [], seen = new Set();
  rows.slice(1).forEach((r, n) => {
    const o = {}; for (const k in idx) o[k] = idx[k] >= 0 ? (r[idx[k]] || '').trim() : '';
    const L = `第 ${n + 2} 行`;
    if (kind === 'employees') {
      if (!o.id) return warn.push(`${L}：員編空白，已略過`);
      if (seen.has(o.id)) return warn.push(`${L}：員編 ${o.id} 重複，已略過`);
      seen.add(o.id); items.push({ id: o.id, name: o.name || o.id, skills: splitSkills(o.skills) });
    } else if (kind === 'machines') {
      if (!o.id || !o.type) return warn.push(`${L}：機台編號或類型空白，已略過`);
      if (seen.has(o.id)) return warn.push(`${L}：機台 ${o.id} 重複，已略過`);
      seen.add(o.id); items.push({ id: o.id, name: o.name || o.id, type: o.type });
    } else {
      const date = normDate(o.date), st = normTime(o.start), en = normTime(o.end);
      if (!date || st == null || en == null) return warn.push(`${L}：日期或時間格式不正確，已略過`);
      const edate = o.edate ? normDate(o.edate) : null;
      if (o.edate && !edate) return warn.push(`${L}：結束日期格式不正確，已略過`);
      const s = absMin(date, st), e = edate ? absMin(edate, en) : absMin(date, en) + (en <= st ? 1440 : 0);
      if (e <= s) return warn.push(`${L}：結束時間不晚於開始時間，已略過`);
      if (kind === 'shifts') {
        if (!o.emp) return warn.push(`${L}：員編空白，已略過`);
        items.push({ emp: o.emp, date, type: o.type || shiftTypeOf(st), start: st, end: en, s, e });
      } else {
        if (!o.id || !o.type) return warn.push(`${L}：工單編號或工種空白，已略過`);
        if (seen.has(o.id)) return warn.push(`${L}：工單 ${o.id} 重複，已略過`);
        seen.add(o.id);
        items.push({ id: o.id, name: o.name || o.id, type: o.type, fixed: o.fixed, date, start: st, edate: edate || '', end: en, s, e, people: normPeople(o.people), setup: normSetup(o.setup), prio: normPrio(o.prio) });
      }
    }
  });
  return { items, warn };
}

/* ---------- 儲存 ---------- */
function save() {
  try { localStorage.setItem('dispatch-v4', JSON.stringify({ e: state.employees, s: state.shifts, m: state.machines, j: state.jobs, c: state.settings })); } catch (e) { /* 忽略 */ }
}
function load() {
  try {
    const d = JSON.parse(localStorage.getItem('dispatch-v4') || 'null');
    if (d) {
      state.employees = d.e || []; state.shifts = d.s || []; state.machines = d.m || []; state.jobs = d.j || [];
      const df = defaults(), c = d.c || {};
      state.settings = { ...df, ...c, breaks: { ...df.breaks, ...(c.breaks || {}) }, indirect: Array.isArray(c.indirect) ? c.indirect : df.indirect };
    }
  } catch (e) { /* 忽略 */ }
}
function invalidate() { state.ctx = state.assign = null; state.indir = []; $('#results').hidden = true; }

/* ---------- 休息、加班與工時 ---------- */
function breakWindows(type, s, e) {
  const out = [];
  for (const [bs0, be0] of state.settings.breaks[type] || []) {
    const bs = normTime(bs0), be = normTime(be0);
    if (bs == null || be == null || be <= bs) continue;
    for (let d = Math.floor(s / 1440); d <= Math.floor((e - 1) / 1440); d++) {
      const a = Math.max(d * 1440 + bs, s), z = Math.min(d * 1440 + be, e);
      if (z > a) out.push([a, z]);
    }
  }
  return out;
}
const brkIn = (sh, x, y) => sh.brk.reduce((t, [p, q]) => t + Math.max(0, Math.min(y, q) - Math.max(x, p)), 0);
const brkLen = (type, s, x) => breakWindows(type, s, x).reduce((t, [p, q]) => t + q - p, 0);

/* 某人在 [a,b] 的實際工作分鐘（扣休息），依班表日期歸戶，供「每日上限」使用 */
function netByDate(ctx, emp, a, b) {
  const m = new Map(); if (b <= a) return m;
  for (const sh of ctx.shiftsBy[emp]) {
    const x = Math.max(a, sh.s), y = Math.min(b, sh.xe);
    if (y > x) m.set(sh.date, (m.get(sh.date) || 0) + y - x - brkIn(sh, x, y));
  }
  return m;
}
const netMin = (ctx, emp, a, b) => { let t = 0; for (const v of netByDate(ctx, emp, a, b).values()) t += v; return t; };
function otMin(ctx, emp, a, b) {
  let t = 0;
  for (const sh of ctx.shiftsBy[emp]) { const x = Math.max(a, sh.e, sh.s), y = Math.min(b, sh.xe); if (y > x) t += y - x - brkIn(sh, x, y); }
  return t;
}
const shiftNet = (ctx, e) => ctx.shiftsBy[e.id].reduce((t, s) => t + s.e - s.s - brkIn(s, s.s, s.e), 0);

/* ---------- 派工核心 ---------- */
function prepare() {
  const cap = state.settings.cap * 60, ot = state.settings.ot;
  const emps = state.employees.map(e => ({ ...e, set: new Set(e.skills.map(nk)) }));
  const shiftsBy = Object.fromEntries(emps.map(e => [e.id, []]));
  state.shifts.forEach(s => { if (shiftsBy[s.emp]) shiftsBy[s.emp].push({ ...s, xe: s.e, brk: [] }); });
  for (const list of Object.values(shiftsBy)) {
    list.sort((a, b) => a.s - b.s);
    list.forEach((sh, i) => {
      if (ot) {
        const limit = i + 1 < list.length ? list[i + 1].s : Infinity, net = x => x - sh.s - brkLen(sh.type, sh.s, x);
        if (net(sh.e) < cap) {
          let lo = sh.e, hi = Math.min(sh.e + 720, limit);
          while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (net(mid) <= cap) lo = mid; else hi = mid - 1; }
          sh.xe = Math.max(lo, sh.e);
        }
      }
      sh.brk = breakWindows(sh.type, sh.s, sh.xe);
    });
  }
  return { emps, shiftsBy, machines: state.machines, jobs: state.jobs };
}
const skillOk = (e, j) => e.set.has(nk(j.type));
const machinesFor = (ctx, j) => j.fixed ? ctx.machines.filter(m => m.id === j.fixed) : ctx.machines.filter(m => nk(m.type) === nk(j.type));
/* 機台占用 = 換線 + 加工，前後工單不可重疊 */
const macClash = (ctx, m, j, A) => ctx.jobs.find(o => o !== j && A[o.id].machine === m.id && !(o.e <= wsOf(j) || j.e <= wsOf(o))) || null;

function busyIndex(A, skip) {
  const m = new Map();
  for (const j of state.jobs) {
    A[j.id].slots.forEach((ch, k) => {
      if (!ch || (skip && skip.job === j.id && (skip.slot == null || skip.slot === k))) return;
      ch.forEach(g => { if (!m.has(g.emp)) m.set(g.emp, []); m.get(g.emp).push(g); });
    });
  }
  return m;
}
function mergeIv(iv) {
  iv.sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const x of iv) { const l = out[out.length - 1]; if (l && x[0] <= l[1]) l[1] = Math.max(l[1], x[1]); else out.push([x[0], x[1]]); }
  return out;
}
/* 人員空檔 = 上班時段（含加班延伸才用 ot）− 已排區段（前後各留交接時間） */
function freeIv(ctx, empId, busy, ot) {
  let iv = mergeIv(ctx.shiftsBy[empId].map(s => [s.s, ot ? s.xe : s.e]));
  const g = state.settings.handover;
  for (const sg of busy.get(empId) || []) {
    const x = sg.a - g, y = sg.b + g, n = [];
    for (const [a, b] of iv) {
      if (y <= a || x >= b) { n.push([a, b]); continue; }
      if (x > a) n.push([a, x]);
      if (y < b) n.push([y, b]);
    }
    iv = n;
  }
  return iv;
}
const reachAt = (iv, t, cap) => { for (const [a, b] of iv) if (a <= t && b > t) return Math.min(b, cap); return t; };

/* 每人每日工時上限：回傳在 [t,r] 內不超過上限的最遠時間 */
function capReach(ctx, emp, t, r, busy, skip) {
  const cap = state.settings.cap * 60, used = new Map();
  for (const g of busy.get(emp) || []) { if (g === skip) continue; for (const [d, n] of netByDate(ctx, emp, g.a, g.b)) used.set(d, (used.get(d) || 0) + n); }
  const fits = x => { for (const [d, n] of netByDate(ctx, emp, t, x)) if ((used.get(d) || 0) + n > cap) return false; return true; };
  let lo = t, hi = r;
  while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (fits(mid)) lo = mid; else hi = mid - 1; }
  return lo;
}
/* 把某段延長到 R（加班）：需在加班延伸範圍內、無衝突、不超過工時上限 */
function extendSeg(ctx, g, R, busy) {
  const arr = busy.get(g.emp), i = arr.indexOf(g); arr.splice(i, 1);
  const ok = freeIv(ctx, g.emp, busy, true).some(([a, b]) => a <= g.a && b >= R) && capReach(ctx, g.emp, g.a, R, busy) >= R;
  arr.splice(i, 0, g);
  if (ok) g.b = R;
  return ok;
}

/* 排出單一人力欄位的接力鏈：後一位提前「交接時間」到場與前一位重疊。
   ot=true 時，若班別之間有空檔，允許前一位加班撐到下一班到場。 */
function planChain(j, ctx, busy, lE, multi, ot, added) {
  const h = state.settings.handover, cands = ctx.emps.filter(e => skillOk(e, j));
  let t = wsOf(j), covered = t; const chain = [];
  while (t < j.e) {
    let best = null;
    for (const e of cands) {
      let r = reachAt(freeIv(ctx, e.id, busy, false), t, j.e);
      if (r > t) r = capReach(ctx, e.id, t, r, busy);
      if (r <= t || (chain.length && r <= covered)) continue;
      if (!best || r > best.r || (r === best.r && ((lE[e.id] || 0) - (lE[best.e.id] || 0) || (multi ? e.skills.length - best.e.skills.length : 0)) < 0)) best = { e, r };
    }
    if (best) {
      const g = { emp: best.e.id, a: t, b: best.r };
      chain.push(g); added.push(g); covered = best.r;
      if (!busy.has(g.emp)) busy.set(g.emp, []);
      busy.get(g.emp).push(g);
      if (best.r >= j.e) break;
      t = Math.max(best.r - h, t + 1);
      continue;
    }
    if (!ot || !chain.length) return { fail: { at: t } };
    const last = chain[chain.length - 1];
    let nextA = Infinity;
    for (const e of cands) for (const [a, b] of freeIv(ctx, e.id, busy, false)) if (a > t && b > a && a < nextA) nextA = a;
    const R = Math.max(last.b, Math.min(j.e, nextA === Infinity ? j.e : nextA + h));
    if (R > last.b && !extendSeg(ctx, last, R, busy)) return { fail: { at: last.b } };
    covered = Math.max(covered, last.b);
    if (R >= j.e) break;
    t = nextA;
  }
  return { chain };
}
function planSlots(j, ctx, busy, lE, multi, ot) {
  const slots = [], added = [];
  const undo = () => added.forEach(g => { const a = busy.get(g.emp); const i = a.indexOf(g); if (i >= 0) a.splice(i, 1); });
  for (let k = 0; k < j.people; k++) {
    const r = planChain(j, ctx, busy, lE, multi, ot, added);
    if (r.fail) { undo(); return { fail: { slot: k, at: r.fail.at } }; }
    slots.push(r.chain);
  }
  return { slots, undo };
}

/* 補派：對排不出來的工單，找出占用「具備該技能人員」的其他工單欄位，
   嘗試讓那個欄位改由其他合格人員接手，騰出人力補派。仍須符合技能，無法補派就不硬排。 */
function repair(ctx, A, lE, multi, prio) {
  const ot = state.settings.ot, notes = [], tried = new Set();
  const failed = ctx.jobs.filter(j => !A[j.id].machine).sort((a, b) => (prio ? b.prio - a.prio : 0) || a.s - b.s);
  for (const j of failed) {
    const macs = machinesFor(ctx, j).filter(m => !macClash(ctx, m, j, A));
    if (!macs.length) continue;
    tried.add(j.id);
    const skilled = new Set(ctx.emps.filter(e => skillOk(e, j)).map(e => e.id));
    const blockers = [];
    for (const o of ctx.jobs) if (o !== j) A[o.id].slots.forEach((ch, k) => {
      if (ch && ch.some(g => skilled.has(g.emp) && g.a < j.e && g.b > wsOf(j))) blockers.push([o, k]);
    });
    for (const [o, k] of blockers) {
      const saved = A[o.id].slots[k]; A[o.id].slots[k] = null;
      const busy = busyIndex(A), added = [];
      let r = planSlots(j, ctx, busy, lE, multi, false);
      if (r.fail && ot) r = planSlots(j, ctx, busy, lE, multi, true);
      if (r.fail) { A[o.id].slots[k] = saved; continue; }
      let c = planChain(o, ctx, busy, lE, multi, false, added);
      if (c.fail && ot) c = planChain(o, ctx, busy, lE, multi, true, added);
      if (c.fail) { A[o.id].slots[k] = saved; continue; }
      macs.sort((a, b) => a.id.localeCompare(b.id));
      A[j.id] = { machine: macs[0].id, slots: r.slots };
      A[o.id].slots[k] = c.chain;
      notes.push(`${j.id} 已補派：調整 ${o.id} 第 ${k + 1} 欄的人員後騰出人力`);
      tried.delete(j.id);
      break;
    }
  }
  return { notes, tried };
}

function runDispatch() {
  const ctx = prepare(), A = {};
  ctx.jobs.forEach(j => { A[j.id] = { machine: null, slots: Array(j.people).fill(null) }; });
  state.ctx = ctx; state.assign = A;
  const prio = $('#optPrio').checked, multi = $('#optMulti').checked;
  const busy = new Map(), lE = Object.fromEntries(ctx.emps.map(e => [e.id, 0])), lM = Object.fromEntries(ctx.machines.map(m => [m.id, 0]));
  const order = ctx.jobs.map(j => ({ j, c: ctx.emps.filter(e => skillOk(e, j)).length - j.people }));
  order.sort((a, b) => (prio ? b.j.prio - a.j.prio : 0) || a.c - b.c || (b.j.e - wsOf(b.j)) - (a.j.e - wsOf(a.j)) || a.j.s - b.j.s);
  for (const { j } of order) {
    const macs = machinesFor(ctx, j).filter(m => !macClash(ctx, m, j, A));
    if (!macs.length) continue;
    let r = planSlots(j, ctx, busy, lE, multi, false);
    if (r.fail && state.settings.ot) r = planSlots(j, ctx, busy, lE, multi, true);
    if (r.fail) continue;
    macs.sort((a, b) => lM[a.id] - lM[b.id] || a.id.localeCompare(b.id));
    A[j.id] = { machine: macs[0].id, slots: r.slots };
    lM[macs[0].id] += j.e - wsOf(j);
    r.slots.flat().forEach(g => { lE[g.emp] += netMin(ctx, g.emp, g.a, g.b); });
  }
  const rp = repair(ctx, A, lE, multi, prio);
  state.repair = rp;
}

const slotDone = (j, ch) => {
  if (!ch || !ch.length) return false;
  let t = wsOf(j);
  for (const g of [...ch].sort((a, b) => a.a - b.a)) { if (g.a > t) return false; t = Math.max(t, g.b); }
  return t >= j.e;
};
const statusOf = j => {
  const a = state.assign[j.id];
  if (a.machine && a.slots.filter(c => slotDone(j, c)).length === j.people) return 'ok';
  return a.machine || a.slots.some(Boolean) ? 'part' : 'none';
};
/* 人員工時拆分：直接（機台加工中）／間接（換線）／其中加班 */
function empHours(id) {
  const { ctx, assign: A } = state; let direct = 0, indirect = 0, ot = 0, other = 0;
  for (const j of state.jobs) for (const ch of A[j.id].slots) for (const g of ch || []) {
    if (g.emp !== id) continue;
    indirect += netMin(ctx, id, g.a, Math.min(g.b, j.s));
    direct += netMin(ctx, id, Math.max(g.a, j.s), g.b);
    ot += otMin(ctx, id, g.a, g.b);
  }
  for (const x of state.indir) if (x.emp === id) other += x.b - x.a;
  return { direct, indirect, other, job: direct + indirect, total: direct + indirect + other, ot };
}
const loadOf = id => empHours(id).job;
const loadM = id => state.jobs.reduce((t, j) => t + (state.assign[j.id].machine === id ? j.e - j.s : 0), 0);
const setupM = id => state.jobs.reduce((t, j) => t + (state.assign[j.id].machine === id ? setupOf(j) : 0), 0);
const fullCover = (ctx, j, A, slot) => {
  const busy = busyIndex(A, { job: j.id, slot });
  return ctx.emps.filter(e => skillOk(e, j) && freeIv(ctx, e.id, busy, state.settings.ot).some(([a, b]) => a <= wsOf(j) && b >= j.e) && capReach(ctx, e.id, wsOf(j), j.e, busy) >= j.e);
};

/* 派工後，把人員在正常班內的空檔（扣休息、已排工單與交接）安排成「間接工作」 */
function subIv(iv, x, y) {
  const n = [];
  for (const [a, b] of iv) {
    if (y <= a || x >= b) { n.push([a, b]); continue; }
    if (x > a) n.push([a, x]);
    if (y < b) n.push([y, b]);
  }
  return n;
}
function computeIndirect() {
  state.indir = [];
  const { ctx, assign: A } = state, tasks = state.settings.indirect.filter(t => t.on && t.name && t.min > 0);
  if (!state.settings.fill || !tasks.length) return;
  const busy = busyIndex(A), g = state.settings.handover, cap = state.settings.cap * 60, minT = Math.min(...tasks.map(t => t.min));
  const total = tasks.map(() => 0);
  for (const e of ctx.emps) {
    let iv = mergeIv(ctx.shiftsBy[e.id].map(s => [s.s, s.e]));
    ctx.shiftsBy[e.id].forEach(sh => sh.brk.forEach(([p, q]) => { iv = subIv(iv, p, q); }));
    const segs = busy.get(e.id) || [], used = new Map();
    segs.forEach(sg => { iv = subIv(iv, sg.a - g, sg.b + g); for (const [d, n] of netByDate(ctx, e.id, sg.a, sg.b)) used.set(d, (used.get(d) || 0) + n); });
    for (const [a, b] of iv) {
      let t = a;
      while (b - t >= minT) {
        const sh = ctx.shiftsBy[e.id].find(s => s.s <= t && t < s.e), date = sh ? sh.date : '';
        const cand = tasks.map((tk, i) => ({ tk, i })).filter(x => x.tk.min <= b - t && (!x.tk.skill || e.set.has(nk(x.tk.skill))) && (used.get(date) || 0) + x.tk.min <= cap);
        if (!cand.length) break;
        cand.sort((p, q) => total[p.i] - total[q.i] || p.i - q.i);
        const pk = cand[0];
        state.indir.push({ emp: e.id, a: t, b: t + pk.tk.min, task: pk.tk.name });
        total[pk.i] += pk.tk.min; used.set(date, (used.get(date) || 0) + pk.tk.min); t += pk.tk.min;
      }
    }
  }
}

function diag(j) {
  const { ctx, assign: A } = state, out = [];
  const macs = machinesFor(ctx, j);
  if (!macs.length) out.push(j.fixed ? `找不到指定機台 ${j.fixed}` : `沒有「${j.type}」類機台`);
  else if (!macs.some(m => !macClash(ctx, m, j, A))) out.push('機台皆被占用：' + macs.map(m => `${m.id}（與 ${macClash(ctx, m, j, A).id} 衝突）`).join('、'));
  const r = planSlots(j, ctx, busyIndex(A, { job: j.id }), {}, false, state.settings.ot);
  if (r.fail) {
    const sk = ctx.emps.filter(e => skillOk(e, j)).length;
    out.push(`第 ${r.fail.slot + 1} 位人員自 ${fmtAbs(r.fail.at)} 起無法接續（需「${j.type}」技能、在班或可加班、與其他工單無衝突、不超過每日 ${state.settings.cap} 小時，且與前一位重疊 ${state.settings.handover} 分鐘交接；具備技能共 ${sk} 人）`);
  }
  if (out.length && state.repair.tried.has(j.id)) out.push('已嘗試調整其他工單的人員安排，仍無符合技能的人可補派');
  return out.join('；');
}

/* ---------- 顯示：匯入與設定 ---------- */
function tableHTML(head, rows, max = 50) {
  return `<table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.slice(0, max).map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>` +
    (rows.length > max ? `<p class="hint">僅顯示前 ${max} 筆，共 ${rows.length} 筆</p>` : '');
}
function renderImport() {
  const view = {
    employees: [SAMPLE.employees.head, state.employees.map(e => [e.id, e.name, e.skills.join(';')])],
    shifts: [SAMPLE.shifts.head, state.shifts.map(s => [s.emp, s.date, s.type, fmt(s.start), fmt(s.end)])],
    machines: [SAMPLE.machines.head, state.machines.map(m => [m.id, m.name, m.type])],
    jobs: [SAMPLE.jobs.head, state.jobs.map(j => [j.id, j.name, j.type, j.fixed, j.date, fmt(j.start), j.edate, fmt(j.end), j.people, j.setup ?? '', j.prio])],
  };
  for (const kind of KINDS) {
    const box = $(`.file[data-kind="${kind}"]`), n = view[kind][1].length, st = $('.status', box);
    st.textContent = n ? `✔ 已載入 ${n} ${LABEL[kind]}` : '尚未匯入';
    st.classList.toggle('ok', !!n);
    $('.preview', box).innerHTML = n ? tableHTML(view[kind][0], view[kind][1]) : '';
  }
  const msgs = [];
  KINDS.forEach(k => state.warn[k].forEach(t => msgs.push(`${KIND_NAME[k]}：${t}`)));
  const ids = new Set(state.employees.map(e => e.id));
  const orphan = [...new Set(state.shifts.filter(s => !ids.has(s.emp)).map(s => s.emp))];
  if (state.employees.length && orphan.length) msgs.push(`班表中有 ${orphan.length} 個員編不在人員清單內：${orphan.join('、')}`);
  $('#messages').innerHTML = msgs.map(t => `<div class="msg">${esc(t)}</div>`).join('');
  renderSettings(); renderJobs();
  const ready = KINDS.every(k => state[k].length);
  $('#btnRun').disabled = !ready;
  $('#runHint').textContent = ready ? '' : '請先匯入四份資料，或按「載入範例資料」。';
}
function renderSettings() {
  const s = state.settings;
  const mins = v => MINUTE_OPTS.includes(v) ? MINUTE_OPTS : [...MINUTE_OPTS, v].sort((a, b) => a - b);
  $('#setSetup').innerHTML = mins(s.setup).map(v => `<option value="${v}"${v === s.setup ? ' selected' : ''}>${v} 分鐘</option>`).join('');
  $('#setHandover').innerHTML = mins(s.handover).map(v => `<option value="${v}"${v === s.handover ? ' selected' : ''}>${v} 分鐘</option>`).join('');
  $('#setCap').innerHTML = [8, 9, 10, 11, 12, 13, 14, 16].map(v => `<option value="${v}"${v === s.cap ? ' selected' : ''}>${v} 小時</option>`).join('');
  $('#setOT').checked = !!s.ot;
  $('#setFill').checked = !!s.fill;
  const skillOpts = [['', '不限技能'], ...typeList().map(t => [t, t + ' 限定'])];
  $('#indRows').innerHTML = s.indirect.map((t, i) =>
    `<div class="brow"><label><input type="checkbox" data-i="${i}" data-f="on"${t.on ? ' checked' : ''}> 啟用</label>` +
    `<input type="text" data-i="${i}" data-f="name" value="${esc(t.name)}" size="14">` +
    sel({ 'data-i': i, 'data-f': 'min' }, [15, 30, 45, 60, 90, 120, 180, 240].map(v => [v, v + ' 分鐘']), t.min) +
    sel({ 'data-i': i, 'data-f': 'skill' }, skillOpts, t.skill) +
    `<button data-i="${i}" data-f="del" class="ghost">刪除</button></div>`).join('');
  const types = [...new Set([...SHIFT_TYPES, ...state.shifts.map(x => x.type)])];
  $('#breakRows').innerHTML = types.map(t => {
    const list = s.breaks[t] || [];
    let ins = '';
    for (let i = 0; i < BREAK_SLOTS; i++) {
      const b = list[i] || ['', ''];
      ins += `<span class="bp"><input type="time" data-bt="${esc(t)}" value="${esc(b[0])}"> – <input type="time" data-bt="${esc(t)}" value="${esc(b[1])}"></span>`;
    }
    return `<div class="brow"><b>${esc(t)}休息</b>${ins}</div>`;
  }).join('');
}
function typeList() {
  return [...new Set([...TYPES, ...state.machines.map(m => m.type), ...state.employees.flatMap(e => e.skills), ...state.jobs.map(j => j.type)])];
}
function renderJobs() {
  const box = $('#jobsTbl');
  if (!state.jobs.length) { box.innerHTML = '<p class="hint" style="padding:10px">尚無工單。匯入後可在這裡用下拉選單調整人數、工種、機台與換線時間。</p>'; return; }
  const types = typeList().map(t => [t, t]);
  const rows = state.jobs.map(j => {
    const macs = state.machines.filter(m => nk(m.type) === nk(j.type));
    const d = { 'data-job': j.id };
    return `<tr><td>${esc(j.id)}</td><td>${esc(j.name)}</td>` +
      `<td>${sel({ ...d, 'data-f': 'type' }, types, j.type)}</td>` +
      `<td>${esc(jobRange(j))}<br><span class="hint">換線自 ${fmtAbs(wsOf(j)).slice(6)}（間接）；加工 ${hrs(j.e - j.s)}h（直接）</span></td>` +
      `<td>${sel({ ...d, 'data-f': 'people' }, [1, 2, 3, 4, 5, 6].map(n => [n, n + ' 人']), j.people)}</td>` +
      `<td>${sel({ ...d, 'data-f': 'fixed' }, [['', '自動選擇'], ...macs.map(m => [m.id, `${m.id} ${m.name}`]), ...(j.fixed && !macs.some(m => m.id === j.fixed) ? [[j.fixed, j.fixed + '（無此機台）']] : [])], j.fixed)}</td>` +
      `<td>${sel({ ...d, 'data-f': 'setup' }, [['', `預設（${state.settings.setup} 分）`], ...MINUTE_OPTS.map(v => [v, v + ' 分'])], j.setup ?? '')}</td>` +
      `<td>${sel({ ...d, 'data-f': 'prio' }, [[3, '3 高'], [2, '2 中'], [1, '1 低']], j.prio)}</td></tr>`;
  }).join('');
  box.innerHTML = `<table><thead><tr><th>工單</th><th>名稱</th><th>工種</th><th>加工時段</th><th>人數</th><th>機台</th><th>換線</th><th>優先序</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/* ---------- 顯示：結果 ---------- */
function renderResults() {
  $('#results').hidden = false;
  const total = state.jobs.length, ok = state.jobs.filter(j => statusOf(j) === 'ok').length;
  let dir = 0, ind = 0, ot = 0, oth = 0;
  computeIndirect();
  state.ctx.emps.forEach(e => { const h = empHours(e.id); dir += h.direct; ind += h.indirect; ot += h.ot; oth += h.other; });
  $('#stats').innerHTML =
    `<div class="stat"><b>${total}</b><span>工單總數</span></div>` +
    `<div class="stat ok"><b>${ok}</b><span>派工完成</span></div>` +
    `<div class="stat ${total - ok ? 'bad' : ''}"><b>${total - ok}</b><span>未完成（無法派／人數不足）</span></div>` +
    `<div class="stat"><b>${total ? Math.round(ok / total * 100) : 0}%</b><span>完成率</span></div>` +
    `<div class="stat wide"><span>人員工時：直接 <b class="inl">${hrs(dir)}</b>h ＋ 間接（換線）<b class="inl">${hrs(ind)}</b>h ＋ 間接（其他工作）<b class="inl">${hrs(oth)}</b>h ＝ <b class="inl">${hrs(dir + ind + oth)}</b>h，其中加班 <b class="inl">${hrs(ot)}</b>h</span></div>`;
  renderList(); renderGanttSel(); renderGantt(); renderLoad(); renderInd();
  $$('#stats .stat > b:not(.inl)').forEach(countUp);
}

function renderList() {
  const { ctx, assign: A } = state, nameOf = Object.fromEntries(ctx.emps.map(e => [e.id, e.name]));
  const jobs = [...state.jobs].sort((a, b) => a.s - b.s || a.id.localeCompare(b.id));
  const rows = jobs.map(j => {
    const a = A[j.id], st = statusOf(j);
    const mopts = machinesFor(ctx, j).filter(m => m.id === a.machine || !macClash(ctx, m, j, A)).map(m => [m.id, `${m.id} ${m.name}`]);
    let people = '';
    for (let k = 0; k < j.people; k++) {
      const ch = a.slots[k];
      const txt = ch ? ch.map(g => `${nameOf[g.emp]} ${segTxt(j, g)}${otMin(ctx, g.emp, g.a, g.b) ? '（加班）' : ''}`).join(' → ') : '';
      const opts = fullCover(ctx, j, A, k).map(e => [`p:${e.id}`, `整段改派：${e.name}（${hrs(loadOf(e.id))}h）`]);
      people += `<div class="slot">${ch ? `<div class="chain${slotDone(j, ch) ? '' : ' bad'}">${esc(txt)}${slotDone(j, ch) ? '' : '（未涵蓋全程）'}</div>` : ''}` +
        sel({ 'data-job': j.id, 'data-slot': k }, [['keep', ch ? '調整此欄…' : '— 未指派 —'], ...(ch ? [['clear', '— 清除此欄 —']] : []), ...opts], 'keep') + '</div>';
    }
    const note = st === 'ok' ? '' : `<span class="bad">${esc(diag(j) || '尚有欄位未指派')}</span>`;
    return `<tr class="${st === 'ok' ? '' : st === 'part' ? 'part' : 'un'}"><td>${esc(j.id)}</td><td>${esc(j.name)}</td><td><span class="chip">${esc(j.type)}</span></td>` +
      `<td>${esc(jobRange(j))}<br><span class="hint">換線 ${setupOf(j)} 分，自 ${fmtAbs(wsOf(j)).slice(6)}</span></td><td><span class="pill p${j.prio}">${j.prio}</span></td><td>${j.people}</td>` +
      `<td>${sel({ 'data-job': j.id, 'data-slot': 'm' }, [['', '— 未指派 —'], ...mopts], a.machine || '')}</td><td>${people}</td><td>${note}</td></tr>`;
  }).join('');
  $('#tab-list').innerHTML = (state.repair.notes.length ? `<p class="hint">補派：${state.repair.notes.map(esc).join('；')}</p>` : '') + `<p class="hint">「人員」欄是接力鏈：A → B 表示 A 做到班別結束（必要時加班），B 提前 ${state.settings.handover} 分鐘到場交接。人員時段從「換線開始」算起（換線為間接工時，之後機台加工為直接工時）。淡橘色＝未補齊，紅色＝完全未派。</p><div class="tblwrap"><table><thead><tr><th>工單</th><th>名稱</th><th>工種</th><th>加工時段</th><th>優先</th><th>人數</th><th>機台</th><th>人員（接力）</th><th>備註</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderGanttSel() {
  const days = new Set();
  state.jobs.forEach(j => { for (let d = Math.floor(wsOf(j) / 1440); d <= Math.floor((j.e - 1) / 1440); d++) days.add(d); });
  state.shifts.forEach(s => { for (let d = Math.floor(s.s / 1440); d <= Math.floor((s.e - 1) / 1440); d++) days.add(d); });
  const dates = [...days].sort((a, b) => a - b).map(isoOf);
  if (!dates.includes(state.gDate)) state.gDate = dates[0];
  $('#ganttDate').innerHTML = dates.map(d => `<option${d === state.gDate ? ' selected' : ''}>${d}</option>`).join('');
}
function renderGantt() {
  const { ctx, assign: A } = state, d0 = dayNum(state.gDate) * 1440, d1 = d0 + 1440;
  const clip = (s, e) => { const a = Math.max(s, d0), b = Math.min(e, d1); return b > a ? [a - d0, b - d0] : null; };
  const segs = [];
  state.shifts.forEach(s => { const c = clip(s.s, s.e); if (c) segs.push(c); });
  state.jobs.forEach(j => { const c = clip(wsOf(j), j.e); if (c) segs.push(c); });
  let lo = segs.length ? Math.floor(Math.min(...segs.map(c => c[0])) / 60) * 60 : 480;
  let hi = segs.length ? Math.ceil(Math.max(...segs.map(c => c[1])) / 60) * 60 : 1080;
  if (hi - lo < 360) hi = lo + 360;
  const pct = m => ((m - lo) / (hi - lo) * 100);
  const w = c => `left:${pct(c[0]).toFixed(2)}%;width:${(pct(c[1]) - pct(c[0])).toFixed(2)}%`;
  const box = (c, cls) => `<div class="${cls}" style="${w(c)}"></div>`;
  const step = (hi - lo) > 720 ? 120 : 60;
  let ticks = '', lines = '';
  for (let m = lo; m <= hi; m += step) { ticks += `<span style="left:${pct(m).toFixed(2)}%">${fmt(m % 1440).slice(0, 2)}</span>`; lines += `<i class="gridline" style="left:${pct(m).toFixed(2)}%"></i>`; }
  const run = (j, c, title) => `<div class="gjob p${j.prio}" style="${w(c)}" title="${esc(title)}">${esc(j.id.replace(/^WO-?/i, ''))} ${esc(j.name)}</div>`;
  const setup = (j, c, title) => `<div class="gsetup" style="${w(c)}" title="${esc(title)}"></div>`;
  /* 把 [a,b] 依加工開始時間拆成換線（間接）與加工（直接）兩塊 */
  const parts = (j, a, b, title) => {
    let h = '';
    const i = a < j.s ? clip(a, Math.min(b, j.s)) : null, d = b > j.s ? clip(Math.max(a, j.s), b) : null;
    if (i) h += setup(j, i, title + '（換線・間接工時）');
    if (d) h += run(j, d, title);
    return h;
  };
  let rows;
  if (state.gView === 'emp') {
    rows = ctx.emps.map(e => {
      const sh = ctx.shiftsBy[e.id].map(s => box(clip(s.s, s.e) || [0, 0], clip(s.s, s.e) ? 'gshift' : 'hide')).join('');
      const ot = ctx.shiftsBy[e.id].filter(s => s.xe > s.e).map(s => clip(s.e, s.xe)).filter(Boolean).map(c => box(c, 'gshift got')).join('');
      const br = ctx.shiftsBy[e.id].flatMap(s => s.brk).map(x => clip(x[0], x[1])).filter(Boolean).map(c => box(c, 'glunch')).join('');
      const jb = state.jobs.flatMap(j => A[j.id].slots.flat().filter(g => g && g.emp === e.id).map(g => parts(j, g.a, g.b, `${j.id} ${j.name}\n${segTxt(j, g)}`))).join('');
      const ib = state.indir.filter(x => x.emp === e.id).map(x => [x, clip(x.a, x.b)]).filter(x => x[1])
        .map(([x, c]) => `<div class="gind" style="${w(c)}" title="${esc(x.task + '\n' + fmt(x.a % 1440) + '–' + fmt(x.b % 1440))}">${esc(x.task)}</div>`).join('');
      return `<div class="grow"><div class="glabel" title="${esc(e.skills.join('、'))}">${esc(e.name)}</div><div class="track">${lines}${ot}${sh}${br}${ib}${jb}</div></div>`;
    }).join('');
  } else {
    rows = ctx.machines.map(m => {
      const jb = state.jobs.filter(j => A[j.id].machine === m.id).map(j => parts(j, wsOf(j), j.e, `${j.id} ${j.name}\n${jobRange(j)}`)).join('');
      return `<div class="grow"><div class="glabel" title="${esc(m.name)}">${esc(m.id)}</div><div class="track">${lines}${jb}</div></div>`;
    }).join('');
  }
  $('#gantt').innerHTML = `<div class="gaxis">${ticks}</div>${rows}`;
  const un = state.jobs.filter(j => statusOf(j) !== 'ok' && clip(wsOf(j), j.e));
  $('#ganttUn').innerHTML = un.length ? `<p class="hint">本日未完成：${un.map(j => `<span class="chip">${esc(j.id)} ${esc(j.name)}</span>`).join('')}</p>` : '';
}

function renderLoad() {
  const { ctx, assign: A } = state;
  const erows = ctx.emps.map(e => {
    const h = empHours(e.id), sm = shiftNet(ctx, e), u = sm ? Math.round(h.total / sm * 100) : 0;
    const n = state.jobs.filter(j => A[j.id].slots.flat().some(g => g && g.emp === e.id)).length;
    return `<tr><td>${esc(e.id)}</td><td>${esc(e.name)}</td><td>${e.skills.map(s => `<span class="chip">${esc(s)}</span>`).join('')}</td><td>${n}</td><td>${hrs(h.direct)}</td><td>${hrs(h.indirect)}</td><td>${hrs(h.other)}</td><td><b>${hrs(h.total)}</b></td><td>${h.ot ? `<span class="bad">${hrs(h.ot)}</span>` : '0.0'}</td><td>${hrs(sm)}</td><td>${hrs(Math.max(0, sm - (h.total - h.ot)))}</td><td><div class="bar"><i style="width:${Math.min(100, u)}%"></i></div>${u}%</td></tr>`;
  }).join('');
  const mmax = Math.max(1, ...ctx.machines.map(m => loadM(m.id) + setupM(m.id)));
  const mrows = ctx.machines.map(m => {
    const t = loadM(m.id), s = setupM(m.id), n = state.jobs.filter(j => A[j.id].machine === m.id).length;
    return `<tr><td>${esc(m.id)}</td><td>${esc(m.name)}</td><td><span class="chip">${esc(m.type)}</span></td><td>${n}</td><td>${hrs(t)}</td><td>${hrs(s)}</td><td><div class="bar"><i style="width:${Math.round((t + s) / mmax * 100)}%"></i></div></td></tr>`;
  }).join('');
  $('#tab-load').innerHTML =
    `<h3>人員（工時已扣各班休息時間）</h3><div class="tblwrap"><table><thead><tr><th>員編</th><th>姓名</th><th>技能</th><th>參與工單</th><th>直接工時</th><th>間接（換線）</th><th>間接（其他工作）</th><th>合計</th><th>其中加班</th><th>正常班工時</th><th>閒置</th><th>負荷率</th></tr></thead><tbody>${erows}</tbody></table></div>` +
    `<h3>機台（休息時機台持續運轉）</h3><div class="tblwrap"><table><thead><tr><th>機台</th><th>名稱</th><th>類型</th><th>工單數</th><th>加工時數（直接）</th><th>換線時數（間接）</th><th>相對稼動</th></tr></thead><tbody>${mrows}</tbody></table></div>`;
}

function renderInd() {
  const { ctx } = state, nameOf = Object.fromEntries(ctx.emps.map(e => [e.id, e.name]));
  if (!state.settings.fill) { $('#tab-ind').innerHTML = '<p class="hint">已關閉「空檔自動安排間接工作」。</p>'; return; }
  const sum = new Map();
  state.indir.forEach(x => sum.set(x.task, (sum.get(x.task) || 0) + x.b - x.a));
  const rows = [...state.indir].sort((a, b) => a.emp.localeCompare(b.emp) || a.a - b.a)
    .map(x => `<tr><td>${esc(x.emp)}</td><td>${esc(nameOf[x.emp])}</td><td><span class="chip">${esc(x.task)}</span></td><td>${fmtAbs(x.a)} – ${fmt(x.b % 1440)}</td><td>${hrs(x.b - x.a)}</td></tr>`).join('');
  $('#tab-ind').innerHTML = `<p class="hint">排不進工單的空檔（已扣休息、已派工單與交接時間，且在每日工時上限內），依各項間接工作累計時數最少者優先輪流安排；不足最短工項的零碎時間維持閒置。</p>` +
    `<p>${[...sum].map(([k, v]) => `<span class="chip">${esc(k)} ${hrs(v)}h</span>`).join('') || '（沒有可安排的空檔）'}</p>` +
    `<div class="tblwrap"><table><thead><tr><th>員編</th><th>姓名</th><th>間接工作</th><th>時段</th><th>時數</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

/* ---------- 事件 ---------- */
function applySample() {
  for (const kind of KINDS) {
    const { head, rows } = SAMPLE[kind];
    const r = build(kind, [head, ...rows.map(r => r.map(String))]);
    state[kind] = r.items; state.warn[kind] = r.warn;
  }
  state.settings = defaults();
  invalidate(); save(); renderImport();
}
function clearAll() {
  KINDS.forEach(k => { state[k] = []; state.warn[k] = []; });
  invalidate(); save(); renderImport();
}

$$('.file').forEach(box => {
  const kind = box.dataset.kind;
  $('input', box).addEventListener('change', async ev => {
    const f = ev.target.files[0]; if (!f) return;
    try {
      const rows = parseCSV(decodeBuffer(await f.arrayBuffer()));
      if (rows.length < 2) throw new Error('檔案沒有資料列');
      const r = build(kind, rows);
      state[kind] = r.items; state.warn[kind] = r.warn;
    } catch (e) {
      state.warn[kind] = ['讀取失敗：' + e.message];
    }
    invalidate(); save(); renderImport();
  });
  $('.tpl', box).addEventListener('click', ev => {
    ev.preventDefault();
    const { head, rows } = SAMPLE[kind];
    download({ employees: '人員技能範本.csv', shifts: '班表範本.csv', machines: '機台清單範本.csv', jobs: '工作排程範本.csv' }[kind], toCSV(head, rows));
  });
});

$('#btnSample').addEventListener('click', applySample);
$('#btnClear').addEventListener('click', clearAll);
$('#btnRun').addEventListener('click', () => { runDispatch(); renderResults(); $('#results').scrollIntoView({ behavior: 'smooth' }); });

$('#setSetup').addEventListener('change', ev => { state.settings.setup = +ev.target.value; settingsChanged(); });
$('#setHandover').addEventListener('change', ev => { state.settings.handover = +ev.target.value; settingsChanged(); });
$('#setCap').addEventListener('change', ev => { state.settings.cap = +ev.target.value; settingsChanged(); });
$('#setFill').addEventListener('change', ev => { state.settings.fill = ev.target.checked; settingsChanged(); });
$('#indRows').addEventListener('change', ev => {
  const t = ev.target, i = +t.dataset.i, f = t.dataset.f, it = state.settings.indirect[i]; if (!it) return;
  if (f === 'on') it.on = t.checked; else if (f === 'name') it.name = t.value.trim(); else if (f === 'min') it.min = +t.value; else if (f === 'skill') it.skill = t.value;
  settingsChanged();
});
$('#indRows').addEventListener('click', ev => {
  if (ev.target.dataset.f !== 'del') return;
  state.settings.indirect.splice(+ev.target.dataset.i, 1); settingsChanged(); renderSettings();
});
$('#btnIndAdd').addEventListener('click', () => { state.settings.indirect.push({ name: '新間接工作', min: 60, skill: '', on: true }); settingsChanged(); renderSettings(); });
$('#setOT').addEventListener('change', ev => { state.settings.ot = ev.target.checked; settingsChanged(); });
$('#breakRows').addEventListener('change', ev => {
  const type = ev.target.dataset.bt; if (!type) return;
  const ins = $$(`input[data-bt="${CSS.escape(type)}"]`, $('#breakRows')), pairs = [];
  for (let i = 0; i < ins.length; i += 2) if (ins[i].value && ins[i + 1].value) pairs.push([ins[i].value, ins[i + 1].value]);
  state.settings.breaks[type] = pairs;
  settingsChanged();
});
function settingsChanged() { invalidate(); save(); renderJobs(); }

$('#jobsTbl').addEventListener('change', ev => {
  const t = ev.target, j = state.jobs.find(x => x.id === t.dataset.job); if (!j) return;
  const f = t.dataset.f, v = t.value;
  if (f === 'type') { j.type = v; j.fixed = ''; }
  else if (f === 'people') j.people = +v;
  else if (f === 'fixed') j.fixed = v;
  else if (f === 'setup') j.setup = v === '' ? null : +v;
  else if (f === 'prio') j.prio = +v;
  invalidate(); save(); renderJobs();
});

$('#tab-list').addEventListener('change', ev => {
  const t = ev.target, j = state.jobs.find(x => x.id === t.dataset.job); if (!j) return;
  const a = state.assign[j.id], v = t.value, slot = t.dataset.slot;
  if (slot === 'm') a.machine = v || null;
  else if (v === 'clear') a.slots[+slot] = null;
  else if (v.startsWith('p:')) a.slots[+slot] = [{ emp: v.slice(2), a: wsOf(j), b: j.e }];
  else return;
  renderResults();
});
$('#ganttDate').addEventListener('change', ev => { state.gDate = ev.target.value; renderGantt(); });
$('#ganttView').addEventListener('change', ev => { state.gView = ev.target.value; renderGantt(); });
$$('.tabs button').forEach(b => b.addEventListener('click', () => {
  $$('.tabs button').forEach(x => x.classList.toggle('on', x === b));
  $$('.tab').forEach(t => { t.hidden = t.id !== 'tab-' + b.dataset.tab; });
}));
$('#btnExport').addEventListener('click', () => {
  const nameOf = Object.fromEntries(state.ctx.emps.map(e => [e.id, e.name]));
  const rows = [...state.jobs].sort((a, b) => a.s - b.s).map(j => {
    const a = state.assign[j.id], st = statusOf(j);
    const relay = a.slots.map(ch => ch ? ch.map(g => `${nameOf[g.emp]}(${segTxt(j, g)})`).join('→') : '(未指派)').join(' ／ ');
    return [j.id, j.name, j.type, fmtAbs(wsOf(j)), fmtAbs(j.s), fmtAbs(j.e), j.people, a.machine || '', relay, { ok: '派工完成', part: '部分指派', none: '未派工' }[st], st === 'ok' ? '' : diag(j)];
  });
  download('派工結果.csv', toCSV(['工單', '名稱', '工種', '換線開始', '加工開始', '結束', '人數', '機台', '人員接力', '狀態', '備註'], rows));
});
$('#btnExport2').addEventListener('click', () => {
  const ctx = state.ctx, nameOf = Object.fromEntries(ctx.emps.map(e => [e.id, e.name]));
  const rows = state.jobs.flatMap(j => state.assign[j.id].slots.flatMap((ch, k) => (ch || []).map(g => [
    g.emp, nameOf[g.emp], j.id, j.name, state.assign[j.id].machine || '', k + 1, fmtAbs(g.a), fmtAbs(g.b),
    hrs(netMin(ctx, g.emp, Math.max(g.a, j.s), g.b)), hrs(netMin(ctx, g.emp, g.a, Math.min(g.b, j.s))), hrs(otMin(ctx, g.emp, g.a, g.b)),
  ]))).concat(state.indir.map(x => [x.emp, nameOf[x.emp], '間接工作', x.task, '', '', fmtAbs(x.a), fmtAbs(x.b), '0.0', hrs(x.b - x.a), '0.0']))
    .sort((x, y) => x[0].localeCompare(y[0]) || x[6].localeCompare(y[6]));
  download('人員派工明細.csv', toCSV(['員編', '姓名', '工單', '名稱', '機台', '人力欄位', '開始', '結束', '直接工時(h)', '間接工時(h)', '其中加班(h)'], rows));
});

/* ---------- 動態效果 ---------- */
const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function countUp(el) {
  const m = el.textContent.match(/^(\d+)(%?)$/); if (!m || reduceMotion) return;
  const to = +m[1], t0 = performance.now(), dur = 700;
  const tick = now => {
    const p = Math.min(1, (now - t0) / dur), v = Math.round(to * (1 - Math.pow(1 - p, 3)));
    el.textContent = v + m[2];
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
(function motion() {
  const targets = $$('.card, .points div');
  targets.forEach(t => t.classList.add('reveal'));
  if (!('IntersectionObserver' in window)) { targets.forEach(t => t.classList.add('in')); return; }
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.08 });
  targets.forEach(t => io.observe(t));
  const nav = $('.nav'), onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
})();

load(); renderImport();
