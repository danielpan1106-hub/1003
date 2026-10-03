'use strict';
/* 戰勤表（CNC 燈號）、時間軸（含全日期總覽與圖片匯出）、復原、機台停機時段 */

/* ================= 時間軸 ================= */
function renderGanttSel() {
  const days = new Set();
  const span = (s, e) => { for (let d = Math.floor(s / 1440); d <= Math.floor((e - 1) / 1440); d++) days.add(d); };
  state.jobs.forEach(j => span(wsOf(j), j.e));
  state.shifts.forEach(s => span(s.s, s.e));
  const dates = [...days].sort((a, b) => a - b).map(isoOf);
  if (state.gDate !== 'all' && !dates.includes(state.gDate)) state.gDate = dates[0];
  $('#ganttDate').innerHTML = `<option value="all"${state.gDate === 'all' ? ' selected' : ''}>全部日期</option>` +
    dates.map(d => `<option${d === state.gDate ? ' selected' : ''}>${d}</option>`).join('');
}

const opNames = j => {
  const nameOf = Object.fromEntries(state.ctx.emps.map(e => [e.id, e.name]));
  const ids = [...new Set(state.assign[j.id].slots.flat().filter(Boolean).map(g => g.emp))];
  return ids.map(i => nameOf[i] || i).join('、');
};

function ganttModel() {
  const { ctx, assign: A } = state, all = state.gDate === 'all';
  const pts = [...state.jobs.flatMap(j => [wsOf(j), j.e]), ...state.shifts.flatMap(s => [s.s, s.e]), ...state.downtime.flatMap(d => [d.s, d.e])];
  let d0, d1;
  if (all) { d0 = Math.floor(Math.min(...pts) / 1440) * 1440; d1 = (Math.floor((Math.max(...pts) - 1) / 1440) + 1) * 1440; }
  else { d0 = dayNum(state.gDate) * 1440; d1 = d0 + 1440; }
  const clip = (s, e) => { const a = Math.max(s, d0), b = Math.min(e, d1); return b > a ? [a - d0, b - d0] : null; };
  let lo = 0, hi = d1 - d0;
  if (!all) {
    const segs = [];
    state.shifts.forEach(s => { const c = clip(s.s, s.e); if (c) segs.push(c); });
    state.jobs.forEach(j => { const c = clip(wsOf(j), j.e); if (c) segs.push(c); });
    lo = segs.length ? Math.floor(Math.min(...segs.map(c => c[0])) / 60) * 60 : 480;
    hi = segs.length ? Math.ceil(Math.max(...segs.map(c => c[1])) / 60) * 60 : 1080;
    if (hi - lo < 360) hi = lo + 360;
  }
  const ticks = [], step = all ? 360 : ((hi - lo) > 720 ? 120 : 60);
  for (let m = lo; m <= hi; m += step) {
    const abs = d0 + m, major = all && m % 1440 === 0;
    ticks.push({ m, label: major ? isoOf(Math.floor(abs / 1440)).slice(5) : fmt(abs % 1440).slice(0, 2), major });
  }
  /* 把 [a,b] 依加工開始時間拆成換線（間接）與加工（直接）兩塊 */
  const parts = (j, a, b, title, label) => {
    const out = [];
    const i = a < j.s ? clip(a, Math.min(b, j.s)) : null, d = b > j.s ? clip(Math.max(a, j.s), b) : null;
    if (i) out.push({ kind: 'setup', c: i, title: title + '（換線・間接工時）' });
    if (d) out.push({ kind: 'run', c: d, prio: j.prio, label, title });
    return out;
  };
  let rows;
  if (state.gView === 'emp') {
    rows = ctx.emps.map(e => ({
      label: e.name, title: e.skills.join('、'),
      shifts: ctx.shiftsBy[e.id].map(s => clip(s.s, s.e)).filter(Boolean),
      ot: ctx.shiftsBy[e.id].filter(s => s.xe > s.e).map(s => clip(s.e, s.xe)).filter(Boolean),
      br: ctx.shiftsBy[e.id].flatMap(s => s.brk).map(x => clip(x[0], x[1])).filter(Boolean),
      blocks: state.jobs.flatMap(j => A[j.id].slots.flat().filter(g => g && g.emp === e.id).flatMap(g => parts(j, g.a, g.b, `${j.id} ${j.name}\n${segTxt(j, g)}`, `${j.id.replace(/^WO-?/i, '')} ${j.name}`))),
      ind: state.indir.filter(x => x.emp === e.id).map(x => ({ c: clip(x.a, x.b), label: x.task, title: `${x.task}\n${fmt(x.a % 1440)}–${fmt(x.b % 1440)}` })).filter(x => x.c),
      down: [],
    }));
  } else {
    rows = ctx.machines.map(m => ({
      label: m.id, title: m.name, shifts: [], ot: [], br: [], ind: [],
      down: state.downtime.filter(d => d.machine === m.id).map(d => ({ c: clip(d.s, d.e), title: `${d.reason} ${fmtAbs(d.s)}–${fmtAbs(d.e)}` })).filter(x => x.c),
      blocks: state.jobs.filter(j => A[j.id].machine === m.id).flatMap(j => parts(j, wsOf(j), j.e, `${j.id} ${j.name}\n${jobRange(j)}\n人員：${opNames(j) || '未指派'}`,
        `${j.id.replace(/^WO-?/i, '')} ${j.name}${opNames(j) ? ' · ' + opNames(j) : ''}`)),
    }));
  }
  const unfinished = state.jobs.filter(j => statusOf(j) !== 'ok' && clip(wsOf(j), j.e));
  return { lo, hi, ticks, rows, unfinished, all };
}

function renderGantt() {
  const m = ganttModel(), pct = v => ((v - m.lo) / (m.hi - m.lo) * 100);
  const w = c => `left:${pct(c[0]).toFixed(2)}%;width:${(pct(c[1]) - pct(c[0])).toFixed(2)}%`;
  const box = (c, cls, extra = '') => `<div class="${cls}" style="${w(c)}"${extra}></div>`;
  const ticks = m.ticks.map(t => `<span class="${t.major ? 'major' : ''}" style="left:${pct(t.m).toFixed(2)}%">${t.label}</span>`).join('');
  const lines = m.ticks.map(t => `<i class="gridline${t.major ? ' major' : ''}" style="left:${pct(t.m).toFixed(2)}%"></i>`).join('');
  const rows = m.rows.map(r => {
    const blocks = r.blocks.map(b => b.kind === 'setup'
      ? `<div class="gsetup" style="${w(b.c)}" title="${esc(b.title)}"></div>`
      : `<div class="gjob p${b.prio}" style="${w(b.c)}" title="${esc(b.title)}">${esc(b.label)}</div>`).join('');
    const ind = r.ind.map(x => `<div class="gind" style="${w(x.c)}" title="${esc(x.title)}">${esc(x.label)}</div>`).join('');
    const down = r.down.map(x => `<div class="gdown" style="${w(x.c)}" title="${esc(x.title)}"></div>`).join('');
    return `<div class="grow"><div class="glabel" title="${esc(r.title)}">${esc(r.label)}</div><div class="track">${lines}` +
      r.ot.map(c => box(c, 'gshift got')).join('') + r.shifts.map(c => box(c, 'gshift')).join('') + r.br.map(c => box(c, 'glunch')).join('') + down + ind + blocks + '</div></div>';
  }).join('');
  $('#gantt').innerHTML = `<div class="gaxis">${ticks}</div>${rows}`;
  $('#ganttUn').innerHTML = m.unfinished.length ? `<p class="hint">${m.all ? '' : '本日'}未完成：${m.unfinished.map(j => `<span class="chip">${esc(j.id)} ${esc(j.name)}</span>`).join('')}</p>` : '';
}

function exportGanttPNG() {
  const m = ganttModel(), W = 1600, L = 130, R = 20, RH = 28, TOP = 64, H = TOP + m.rows.length * RH + 24;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), FONT = '"Noto Sans TC","Microsoft JhengHei",sans-serif';
  const X = v => L + (v - m.lo) / (m.hi - m.lo) * (W - L - R);
  const PRIO = { 3: '#d2573f', 2: '#e2a53a', 1: '#2f8fb0' };
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#007c72'; g.font = `bold 20px ${FONT}`;
  g.fillText(`時間軸　${state.gDate === 'all' ? '全部日期' : state.gDate}（${state.gView === 'emp' ? '依人員' : '依機台'}）`, 12, 30);
  g.font = `12px ${FONT}`; g.fillStyle = '#7a8583';
  m.ticks.forEach(t => { g.fillText(t.label, X(t.m) - 6, TOP - 8); });
  const rect = (c, y, color, alpha = 1, inset = 0) => { g.globalAlpha = alpha; g.fillStyle = color; g.fillRect(X(c[0]), y + inset, Math.max(1, X(c[1]) - X(c[0])), RH - 4 - inset * 2); g.globalAlpha = 1; };
  m.rows.forEach((r, i) => {
    const y = TOP + i * RH;
    g.fillStyle = i % 2 ? '#fbfdfc' : '#f5faf9'; g.fillRect(L, y, W - L - R, RH - 4);
    g.fillStyle = '#4b4b4b'; g.font = `13px ${FONT}`; g.fillText(r.label, 10, y + 17);
    r.ot.forEach(c => rect(c, y, '#c9e3df', .5));
    r.shifts.forEach(c => rect(c, y, '#e1f0ee'));
    r.br.forEach(c => rect(c, y, '#b9c9c6', .7));
    r.down.forEach(d => rect(d.c, y, '#e0443e', .55));
    r.ind.forEach(x => { rect(x.c, y, '#5fae86', 1, 3); g.save(); g.beginPath(); g.rect(X(x.c[0]), y, X(x.c[1]) - X(x.c[0]), RH); g.clip(); g.fillStyle = '#fff'; g.font = `11px ${FONT}`; g.fillText(x.label, X(x.c[0]) + 3, y + 16); g.restore(); });
    r.blocks.forEach(b => {
      if (b.kind === 'setup') { rect(b.c, y, '#8f9b98', .8, 3); return; }
      rect(b.c, y, PRIO[b.prio], 1, 3);
      g.save(); g.beginPath(); g.rect(X(b.c[0]), y, X(b.c[1]) - X(b.c[0]), RH); g.clip();
      g.fillStyle = '#fff'; g.font = `11px ${FONT}`; g.fillText(b.label, X(b.c[0]) + 3, y + 16); g.restore();
    });
  });
  g.strokeStyle = '#dfe9e7'; g.lineWidth = 1;
  m.ticks.forEach(t => { g.beginPath(); g.moveTo(X(t.m), TOP); g.lineTo(X(t.m), TOP + m.rows.length * RH); g.stroke(); });
  cv.toBlob(b => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `時間軸_${state.gDate}_${state.gView === 'emp' ? '人員' : '機台'}.png`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
}

/* ================= 戰勤表（CNC 燈號） ================= */
const LAMPS = { green: '生產中', blue: '待料', yellow: '完工', red: '異常／維護', gray: '無排程' };
const toLocal = T => `${isoOf(Math.floor(T / 1440))}T${fmt(T % 1440)}`;
const lampDot = c => `<i class="lampdot ${c}"></i>`;

function boardRange() {
  const pts = [...state.jobs.flatMap(j => [wsOf(j), j.e]), ...state.downtime.flatMap(d => [d.s, d.e])];
  if (!pts.length) return [0, 0];
  return [Math.floor(Math.min(...pts) / 15) * 15, Math.ceil(Math.max(...pts) / 15) * 15];
}
function opsAt(j, T) {
  const ids = new Set();
  state.assign[j.id].slots.forEach(ch => (ch || []).forEach(g => { if (g.a <= T && T < g.b) ids.add(g.emp); }));
  return [...ids];
}
const onBreak = (emp, T) => state.ctx.shiftsBy[emp].some(sh => sh.s <= T && T < sh.xe && sh.brk.some(([p, q]) => p <= T && T < q));

/* 燈號：綠＝生產中、藍＝待料（含換線）、黃＝完工、紅＝異常／維護（或加工中無人看守） */
function machineStatus(m, T) {
  const jobs = state.jobs.filter(j => state.assign[j.id].machine === m.id).sort((a, b) => wsOf(a) - wsOf(b));
  const down = state.downtime.find(d => d.machine === m.id && d.s <= T && T < d.e);
  const run = jobs.find(j => j.s <= T && T < j.e), setup = jobs.find(j => wsOf(j) <= T && T < j.s);
  const next = jobs.find(j => wsOf(j) > T), last = [...jobs].reverse().find(j => j.e <= T);
  const cur = run || setup, ops = cur ? opsAt(cur, T) : [];
  const r = { m, jobs, down, run, setup, next, last, cur, ops };
  if (down) { r.color = 'red'; r.label = `${down.reason}中`; }
  else if (run && !ops.length) { r.color = 'red'; r.label = '異常：加工中無人看守'; }
  else if (run) { r.color = 'green'; r.label = '生產中'; }
  else if (setup) { r.color = 'blue'; r.label = '待料（換線中）'; }
  else if (next) { r.color = 'blue'; r.label = '待料'; }
  else if (jobs.length) { r.color = 'yellow'; r.label = '完工'; }
  else { r.color = 'gray'; r.label = '無排程'; }
  return r;
}

function personStatus(e, T) {
  const sh = state.ctx.shiftsBy[e.id].find(s => s.s <= T && T < s.xe);
  if (!sh) return { c: 'off', t: '未上班' };
  const ot = T >= sh.e ? '（加班）' : '';
  if (onBreak(e.id, T)) return { c: 'brk', t: '休息' };
  for (const j of state.jobs) {
    const a = state.assign[j.id];
    for (const ch of a.slots) for (const g of ch || []) {
      if (g.emp === e.id && g.a <= T && T < g.b) return T < j.s ? { c: 'set', t: `換線 ${a.machine} ${j.id}${ot}` } : { c: 'run', t: `加工 ${a.machine} ${j.id}${ot}` };
    }
  }
  const ind = state.indir.find(x => x.emp === e.id && x.a <= T && T < x.b);
  if (ind) return { c: 'ind', t: `間接：${ind.task}${ot}` };
  return { c: 'idle', t: `待命${ot}` };
}

function renderBoard() {
  if (!state.ctx) return;
  const [lo, hi] = boardRange(), r = $('#boardRange');
  r.min = lo; r.max = hi; r.step = 15;
  if (state.boardT == null || state.boardT < lo || state.boardT > hi) state.boardT = lo;
  $('#boardPlay').textContent = state.boardTimer ? '⏸ 暫停' : '▶ 播放';
  renderBoardBody();
}

function renderBoardBody() {
  const T = state.boardT, { ctx } = state;
  $('#boardRange').value = T; $('#boardT').value = toLocal(T);
  const nameOf = Object.fromEntries(ctx.emps.map(e => [e.id, e.name]));
  const sts = ctx.machines.map(m => machineStatus(m, T));
  const cnt = c => sts.filter(s => s.color === c).length;
  $('#boardSum').innerHTML = Object.entries(LAMPS).map(([c, n]) => `<div class="bsum ${c}">${lampDot(c)}<b>${cnt(c)}</b><span>${n}</span></div>`).join('') +
    `<div class="bsum time"><span>目前時間</span><b>${fmtAbs(T)}</b></div>`;
  const people = ids => ids.map(i => `${esc(nameOf[i] || i)}（${esc(i)}）${onBreak(i, T) ? '<em>休息</em>' : ''}`).join('、');
  const types = [...new Set(ctx.machines.map(m => m.type))];
  $('#boardMachines').innerHTML = types.map(type => {
    const group = sts.filter(s => s.m.type === type), n = c => group.filter(s => s.color === c).length;
    const head = Object.keys(LAMPS).filter(c => n(c)).map(c => `<span>${lampDot(c)}${n(c)}</span>`).join('');
    const tiles = group.map(s => {
      const j = s.cur || s.next || s.last, pct = s.run ? Math.round((T - s.run.s) / (s.run.e - s.run.s) * 100) : (s.color === 'yellow' ? 100 : 0);
      let line2 = '';
      if (s.down) line2 = `<div class="mj">${esc(s.down.reason)}：${fmtAbs(s.down.s)} – ${fmtAbs(s.down.e)}</div>`;
      else if (j) line2 = `<div class="mj"><b>${esc(j.id)}</b> ${esc(j.name)}</div><div class="mh">${s.run ? '預計完工 ' + fmtAbs(j.e) : s.setup ? '開始加工 ' + fmtAbs(j.s) : s.next ? '下一單 ' + fmtAbs(wsOf(j)) + ' 起' : '完工於 ' + fmtAbs(j.e)}</div>`;
      const who = s.ops.length ? `<div class="mo">👤 ${people(s.ops)}</div>` : (s.next && !s.cur ? `<div class="mo dim">預排：${esc(opNames(s.next) || '未指派')}</div>` : '');
      return `<div class="mtile ${s.color}"><div class="mt"><span class="lamp"></span><b>${esc(s.m.id)}</b><small>${esc(s.m.name)}</small></div>` +
        `<div class="ms">${esc(s.label)}</div>${line2}${who}<div class="mb"><i style="width:${pct}%"></i></div></div>`;
    }).join('');
    return `<div class="bgroup"><h4>${esc(type)}<small>${group.length} 台</small><span class="bcnt">${head}</span></h4><div class="mgrid">${tiles}</div></div>`;
  }).join('');
  $('#boardPeople').innerHTML = ctx.emps.map(e => {
    const p = personStatus(e, T);
    return `<div class="pcard ${p.c}"><b>${esc(e.name)}</b><small>${esc(e.id)}</small><span>${esc(p.t)}</span></div>`;
  }).join('');
}

/* ================= 事件 ================= */
$('#boardRange').addEventListener('input', ev => { state.boardT = +ev.target.value; renderBoardBody(); });
$('#boardT').addEventListener('change', ev => {
  const [d, t] = ev.target.value.split('T'); if (!d || !t) return;
  const [lo, hi] = boardRange();
  state.boardT = Math.min(hi, Math.max(lo, Math.round(absMin(d, normTime(t)) / 15) * 15)); renderBoardBody();
});
$('#boardPlay').addEventListener('click', () => {
  if (state.boardTimer) { clearInterval(state.boardTimer); state.boardTimer = null; $('#boardPlay').textContent = '▶ 播放'; return; }
  const hi = boardRange()[1];
  if (state.boardT >= hi) state.boardT = boardRange()[0];
  state.boardTimer = setInterval(() => {
    state.boardT = Math.min(hi, state.boardT + 30);
    renderBoardBody();
    if (state.boardT >= hi) { clearInterval(state.boardTimer); state.boardTimer = null; $('#boardPlay').textContent = '▶ 播放'; }
  }, 700);
  $('#boardPlay').textContent = '⏸ 暫停';
});
$('#boardStart').addEventListener('click', () => { state.boardT = boardRange()[0]; renderBoardBody(); });
$('#boardEnd').addEventListener('click', () => { state.boardT = boardRange()[1]; renderBoardBody(); });

$('#btnGanttPng').addEventListener('click', () => { if (state.ctx) exportGanttPNG(); });

function updateUndo() { $('#btnUndo').disabled = !state.history.length; $('#btnResetAuto').disabled = !state.autoSnap; }
$('#btnUndo').addEventListener('click', () => {
  if (!state.history.length) return;
  state.assign = JSON.parse(state.history.pop()); renderResults();
});
$('#btnResetAuto').addEventListener('click', () => {
  if (!state.autoSnap) return;
  pushHistory(); state.assign = JSON.parse(state.autoSnap); renderResults();
});

/* 機台停機時段 */
$('#dtRows').addEventListener('change', ev => {
  const t = ev.target, d = state.downtime[+t.dataset.i]; if (!d) return;
  const f = t.dataset.f;
  if (f === 'machine') d.machine = t.value;
  else if (f === 'reason') d.reason = t.value;
  else if (f === 's' || f === 'e') { const [dd, tt] = t.value.split('T'); if (dd && tt) d[f] = absMin(dd, normTime(tt)); }
  settingsChanged();
});
$('#dtRows').addEventListener('click', ev => {
  if (ev.target.dataset.f !== 'del') return;
  state.downtime.splice(+ev.target.dataset.i, 1); settingsChanged(); renderDowntime(); renderImport();
});
$('#btnDtAdd').addEventListener('click', () => {
  const base = state.jobs.length ? Math.floor(Math.min(...state.jobs.map(wsOf)) / 60) * 60 : absMin('2026-10-05', 480);
  state.downtime.push({ machine: (state.machines[0] || {}).id || '', s: base, e: base + 240, reason: '維護' });
  settingsChanged(); renderDowntime();
});
$('#fileDt').addEventListener('change', async ev => {
  const f = ev.target.files[0]; if (!f) return;
  try {
    const rows = parseCSV(decodeBuffer(await f.arrayBuffer()));
    if (rows.length < 2) throw new Error('檔案沒有資料列');
    const r = build('downtime', rows);
    state.downtime = r.items; state.warn.downtime = r.warn;
  } catch (e) { state.warn.downtime = ['讀取失敗：' + e.message]; }
  invalidate(); save(); renderImport();
  ev.target.value = '';
});
$('#tplDt').addEventListener('click', ev => {
  ev.preventDefault();
  download('機台停機範本.csv', toCSV(SAMPLE.downtime.head, SAMPLE.downtime.rows));
});

/* 匯入區的停機警告也顯示 */
const _renderImport = renderImport;
renderImport = function () {
  _renderImport();
  const w = (state.warn.downtime || []).map(t => `<div class="msg">停機時段：${esc(t)}</div>`).join('');
  if (w) $('#messages').insertAdjacentHTML('beforeend', w);
};
renderImport();
