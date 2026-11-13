/* Interfaz del dashboard: filtros, pestañas, gráficos SVG propios (sin librerías), detalle por solicitud. */
(function () {
  const C = window.MKT_CONFIG, M = window.MKT;
  M.setConfig({ tz: C.TZ_OFFSET_H, designers: C.DESIGNERS, feriados: C.FERIADOS });
  const DEMO = /[?&]demo=1/.test(location.search);
  const $ = (s, r = document) => r.querySelector(s);
  const NS = 'http://www.w3.org/2000/svg';
  const fmtD = M.fmtD, pct = M.pct;
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const mesLbl = ym => MES[+ym.slice(5, 7) - 1] + ' ' + ym.slice(2, 4);
  const fecha = ms => ms == null ? '—' : M.ymd(ms).split('-').reverse().join('/');
  const N1 = x => x == null ? '—' : (Math.round(x * 10) / 10).toString().replace('.', ',');

  // ---------- helpers DOM ----------
  function h(tag, at, ...kids) {
    const e = document.createElement(tag);
    for (const k in (at || {})) { const v = at[k]; if (v == null || v === false) continue; if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v); }
    kids.flat(9).forEach(c => { if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c)); });
    return e;
  }
  function S(tag, at, ...kids) {
    const e = document.createElementNS(NS, tag);
    for (const k in (at || {})) e.setAttribute(k, at[k]);
    kids.flat(9).forEach(c => { if (c != null) e.append(c.nodeType ? c : document.createTextNode(c)); });
    return e;
  }
  const tipEl = $('#tip');
  const tip = {
    show(ev, head, rows) {
      tipEl.replaceChildren(h('b', {}, head), ...rows.map(r => h('div', { class: 'r' }, r.color ? h('span', { class: 'k', style: 'border-color:' + r.color }) : null, h('strong', {}, r.value), h('span', {}, r.label || ''))));
      tipEl.style.display = 'block';
      const w = tipEl.offsetWidth, hh = tipEl.offsetHeight; let x = ev.clientX + 14, y = ev.clientY + 14;
      if (x + w > innerWidth - 8) x = ev.clientX - w - 14; if (y + hh > innerHeight - 8) y = ev.clientY - hh - 14;
      tipEl.style.left = Math.max(4, x) + 'px'; tipEl.style.top = Math.max(4, y) + 'px';
    },
    hide() { tipEl.style.display = 'none'; },
  };
  const BKT = { cola: 'var(--s1)', solicitante: 'var(--s2)', diseno: 'var(--s3)', aprobacion: 'var(--s4)', pausa: 'var(--neutral)' };
  const BKT_ORDER = ['cola', 'diseno', 'solicitante', 'aprobacion', 'pausa'];

  // ---------- estado ----------
  const st = { recs: [], now: Date.now(), biz: false, tab: 'resumen', period: 'all', f: {}, q: '', dim: 'area', sort: { k: 't0', dir: -1 }, all: [], view: [] };
  const DIMS = [['area', 'Área'], ['solicitante', 'Solicitante'], ['marca', 'Marca'], ['destino', 'Destino'], ['tproc', 'Tipo de proceso'], ['tdis', 'Tipo de diseño'], ['urg', 'Urgencia'], ['estado', 'Estado'], ['proveedor', 'Proveedor']];
  const DIMN = Object.fromEntries(DIMS);

  function recompute() {
    st.all = M.deriveAll(st.recs, st.now, st.biz);
    const now = st.now, curM = M.ym(now), prev = (() => { const d = new Date(now - 6 * 36e5); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); })();
    const q = st.q.trim().toLowerCase();
    st.view = st.all.filter(d => {
      if (st.period === '30' && d.t0 < now - 30 * M.DAY) return false;
      if (st.period === '90' && d.t0 < now - 90 * M.DAY) return false;
      if (st.period === 'mes' && d.mes !== curM) return false;
      if (st.period === 'prev' && d.mes !== prev) return false;
      if (/^\d{4}-\d{2}$/.test(st.period) && d.mes !== st.period) return false;
      for (const [k] of DIMS) { const sel = st.f[k]; if (sel && sel.size && !sel.has(d[k])) return false; }
      if (q && !(d.titulo + ' ' + d.sol + ' ' + d.solicitante).toLowerCase().includes(q)) return false;
      return true;
    });
    st.sum = M.summary(st.view);
  }

  // ---------- filtros ----------
  function buildFilters() {
    const box = $('#filters'); box.replaceChildren();
    const months = [...new Set(st.all.map(d => d.mes))].sort().reverse();
    const per = h('select', { 'aria-label': 'Periodo', onchange: e => { st.period = e.target.value; refresh(); } },
      ...[['all', 'Todo el periodo'], ['30', 'Últimos 30 días'], ['90', 'Últimos 90 días'], ['mes', 'Este mes'], ['prev', 'Mes anterior']].map(([v, t]) => h('option', { value: v, selected: st.period === v }, t)),
      ...months.map(m => h('option', { value: m, selected: st.period === m }, 'Mes: ' + mesLbl(m))));
    box.append(per);
    DIMS.forEach(([k, label]) => {
      const vals = M.groupBy(st.all, d => d[k]); const sel = st.f[k] || new Set(); st.f[k] = sel;
      const det = h('details', { class: 'ms' }, h('summary', {}, label, sel.size ? h('span', { class: 'badge' }, sel.size) : null),
        h('div', { class: 'pop' }, ...[...vals].sort((a, b) => b[1].length - a[1].length).map(([v, g]) => h('label', {},
          h('input', { type: 'checkbox', checked: sel.has(v), onchange: e => { const s = st.f[k] || (st.f[k] = new Set()); e.target.checked ? s.add(v) : s.delete(v); const sm = e.target.closest('details').querySelector('summary'); sm.replaceChildren(label, s.size ? h('span', { class: 'badge' }, s.size) : ''); refresh(true); } }), v, h('span', { class: 'cnt' }, g.length)))));
      box.append(det);
    });
    box.append(h('input', { type: 'search', placeholder: 'Buscar título, ID o solicitante', value: st.q, style: 'min-width:220px', oninput: e => { st.q = e.target.value; clearTimeout(st.qt); st.qt = setTimeout(() => refresh(true), 250); } }));
    box.append(h('button', { onclick: () => { st.f = {}; st.q = ''; st.period = 'all'; refresh(); } }, 'Limpiar filtros'));
    box.append(h('span', { class: 'note', id: 'cnt' }));
  }
  document.addEventListener('click', e => { document.querySelectorAll('details.ms[open]').forEach(d => { if (!d.contains(e.target)) d.open = false; }); });

  // ---------- componentes ----------
  function tile(label, value, note, cls) { return h('div', { class: 'card tile ' + (cls || '') }, h('div', { class: 'lbl' }, label), h('div', { class: 'val' }, value), note ? h('div', { class: 'note' }, note) : null); }
  function legend(items) { return h('div', { class: 'legend' }, items.map(i => h('span', {}, h('i', { style: 'background:' + i.color }), i.name))); }
  /** Tarjeta con vista de gráfico y vista de tabla (el dato siempre es accesible sin pasar el cursor). */
  function card(title, sub, build, table) {
    const body = h('div'), tb = h('div', { style: 'display:none' });
    const bt = h('button', { onclick: () => { const t = tb.style.display === 'none'; tb.style.display = t ? '' : 'none'; body.style.display = t ? 'none' : ''; bt.textContent = t ? 'Gráfico' : 'Tabla'; if (!t) draw(); } }, 'Tabla');
    const el = h('div', { class: 'card' }, h('span', { class: 'tools' }, table ? bt : null), h('h3', {}, title), h('div', { class: 'sub' }, sub || ''), body, tb);
    const draw = () => { body.replaceChildren(); build(body); };
    if (table) tb.append(h('div', { class: 'tw' }, simpleTable(table.cols, table.rows)));
    requestAnimationFrame(draw); el._draw = draw; return el;
  }
  function simpleTable(cols, rows) {
    return h('table', {}, h('thead', {}, h('tr', {}, cols.map((c, i) => h('th', { class: i ? 'n' : '' }, c)))),
      h('tbody', {}, rows.map(r => h('tr', {}, r.map((c, i) => h('td', { class: i ? 'n' : '' }, c == null ? '—' : String(c)))))));
  }
  function scale(max, n = 4) {
    if (!(max > 0)) return { top: 1, step: 0.25, ticks: [0, .25, .5, .75, 1] };
    const raw = max / n, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p, nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10, step = nf * p, top = Math.ceil(max / step - 1e-9) * step;
    const ticks = []; for (let v = 0; v <= top + step / 1e6; v += step) ticks.push(+v.toFixed(6)); return { top, step, ticks };
  }
  const tickFmt = v => v >= 10000 ? Math.round(v / 1000) + 'K' : (Math.round(v * 100) / 100).toString().replace('.', ',');
  const trunc = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;
  function topRound(x, y, w, hgt, r) { // barra con extremo superior redondeado y base cuadrada
    r = Math.min(r, w / 2, hgt); return `M${x},${y + hgt}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + hgt}Z`;
  }
  function rightRound(x, y, w, hgt, r) {
    r = Math.min(r, hgt / 2, w); return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + hgt - r}Q${x + w},${y + hgt} ${x + w - r},${y + hgt}H${x}Z`;
  }

  /** Líneas con cruz de lectura y un solo tooltip para todas las series. */
  function lineChart(el, o) {
    const W = Math.max(280, el.clientWidth || 600), H = o.height || 230, m = { l: 44, r: o.endLabels ? 70 : 14, t: 10, b: 26 };
    const vals = o.series.flatMap(s => s.vals).filter(v => v != null), sc = scale(Math.max(0, ...vals));
    const n = o.xs.length, X = i => m.l + (n === 1 ? (W - m.l - m.r) / 2 : i * (W - m.l - m.r) / (n - 1)), Y = v => m.t + (H - m.t - m.b) * (1 - v / sc.top);
    const svg = S('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': o.title || 'Gráfico de líneas' });
    sc.ticks.forEach(t => { svg.append(S('line', { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t), class: t === 0 ? 'ax' : 'gr' }), S('text', { x: m.l - 6, y: Y(t) + 4, 'text-anchor': 'end' }, o.yfmt ? o.yfmt(t) : tickFmt(t))); });
    const every = Math.ceil(n / Math.floor((W - m.l - m.r) / 54));
    o.xs.forEach((x, i) => { if (i % every === 0) svg.append(S('text', { x: X(i), y: H - 8, 'text-anchor': 'middle' }, x)); });
    o.series.forEach(s => {
      let d = ''; s.vals.forEach((v, i) => { if (v != null) d += (d && s.vals[i - 1] != null ? 'L' : 'M') + X(i) + ',' + Y(v); });
      svg.append(S('path', { d, fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      s.vals.forEach((v, i) => { if (v != null && (i === n - 1 || n <= 14)) svg.append(S('circle', { cx: X(i), cy: Y(v), r: 4, fill: s.color, stroke: 'var(--surface)', 'stroke-width': 2 })); });
      const li = s.vals.map((v, i) => v != null ? i : -1).filter(i => i >= 0).pop();
      if (o.endLabels && li != null && li >= 0) svg.append(S('text', { x: X(li) + 8, y: Y(s.vals[li]) + 4, class: 'vl' }, (o.yfmt || tickFmt)(s.vals[li])));
    });
    const cross = S('line', { y1: m.t, y2: H - m.b, class: 'ax', style: 'display:none' }); svg.append(cross);
    const ov = S('rect', { x: m.l, y: 0, width: W - m.l - m.r, height: H, fill: 'transparent' }); svg.append(ov);
    ov.addEventListener('pointermove', ev => {
      const r = svg.getBoundingClientRect(), px = (ev.clientX - r.left) * (W / r.width); let i = n === 1 ? 0 : Math.round((px - m.l) / ((W - m.l - m.r) / (n - 1))); i = Math.max(0, Math.min(n - 1, i));
      cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.style.display = '';
      tip.show(ev, o.xs[i], o.series.map(s => ({ color: s.color, value: s.vals[i] == null ? '—' : (o.yfmt || tickFmt)(s.vals[i]), label: s.name })));
    });
    ov.addEventListener('pointerleave', () => { cross.style.display = 'none'; tip.hide(); });
    if (o.series.length > 1) el.append(legend(o.series.map(s => ({ name: s.name, color: s.color }))));
    el.append(svg);
  }
  /** Columnas simples (una serie). */
  function colChart(el, o) {
    const W = Math.max(280, el.clientWidth || 600), H = o.height || 220, m = { l: 44, r: 10, t: 16, b: 26 }, n = o.labels.length;
    const sc = scale(Math.max(0, ...o.vals.filter(v => v != null))), band = (W - m.l - m.r) / Math.max(n, 1), bw = Math.min(24, band * .7);
    const Y = v => m.t + (H - m.t - m.b) * (1 - v / sc.top);
    const svg = S('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': o.title || 'Gráfico de columnas' });
    sc.ticks.forEach(t => svg.append(S('line', { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t), class: t === 0 ? 'ax' : 'gr' }), S('text', { x: m.l - 6, y: Y(t) + 4, 'text-anchor': 'end' }, (o.yfmt || tickFmt)(t))));
    const every = Math.ceil(n / Math.floor((W - m.l - m.r) / 46));
    o.labels.forEach((l, i) => {
      const v = o.vals[i], cx = m.l + band * (i + .5);
      if (i % every === 0) svg.append(S('text', { x: cx, y: H - 8, 'text-anchor': 'middle' }, l));
      if (v == null) return;
      const bar = S('path', { d: topRound(cx - bw / 2, Y(v), bw, Math.max(1, Y(0) - Y(v)), 4), fill: o.color || 'var(--s1)' });
      if (n <= 14 && v > 0) svg.append(S('text', { x: cx, y: Y(v) - 4, 'text-anchor': 'middle', class: 'vl' }, (o.vfmt || o.yfmt || tickFmt)(v)));
      const hit = S('rect', { x: cx - band / 2, y: m.t, width: band, height: H - m.t - m.b, fill: 'transparent', tabindex: 0 });
      const on = ev => { bar.setAttribute('opacity', .75); tip.show(ev, l, (o.tip ? o.tip(i) : [{ value: (o.vfmt || o.yfmt || tickFmt)(v), label: o.name || '' }])); };
      hit.addEventListener('pointermove', on); hit.addEventListener('pointerleave', () => { bar.setAttribute('opacity', 1); tip.hide(); });
      hit.addEventListener('focus', () => { const r = hit.getBoundingClientRect(); on({ clientX: r.left + r.width / 2, clientY: r.top }); }); hit.addEventListener('blur', () => tip.hide());
      svg.append(bar, hit);
    });
    el.append(svg);
  }
  /** Columnas apiladas (partes con 2 px de separación). */
  function stackChart(el, o) {
    const W = Math.max(280, el.clientWidth || 600), H = o.height || 240, m = { l: 44, r: 10, t: 10, b: 26 }, n = o.labels.length;
    const tot = o.data.map(d => o.parts.reduce((s, p) => s + (d[p.key] || 0), 0)), sc = scale(Math.max(0, ...tot)), band = (W - m.l - m.r) / Math.max(n, 1), bw = Math.min(24, band * .7);
    const Y = v => m.t + (H - m.t - m.b) * (1 - v / sc.top);
    const svg = S('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': o.title || 'Columnas apiladas' });
    sc.ticks.forEach(t => svg.append(S('line', { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t), class: t === 0 ? 'ax' : 'gr' }), S('text', { x: m.l - 6, y: Y(t) + 4, 'text-anchor': 'end' }, tickFmt(t))));
    const every = Math.ceil(n / Math.floor((W - m.l - m.r) / 46));
    o.labels.forEach((l, i) => {
      const cx = m.l + band * (i + .5); if (i % every === 0) svg.append(S('text', { x: cx, y: H - 8, 'text-anchor': 'middle' }, l));
      let acc = 0; const parts = o.parts.filter(p => (o.data[i][p.key] || 0) > 0), g = S('g');
      parts.forEach((p, j) => {
        const v = o.data[i][p.key], y1 = Y(acc + v), y0 = Y(acc), hgt = Math.max(1, y0 - y1 - (j < parts.length - 1 || parts.length > 1 ? 2 : 0));
        g.append(S('path', { d: j === parts.length - 1 ? topRound(cx - bw / 2, y1, bw, hgt, 4) : `M${cx - bw / 2},${y1}h${bw}v${hgt}h${-bw}Z`, fill: p.color })); acc += v;
      });
      const hit = S('rect', { x: cx - band / 2, y: m.t, width: band, height: H - m.t - m.b, fill: 'transparent', tabindex: 0 });
      const on = ev => { g.setAttribute('opacity', .8); tip.show(ev, l + ' · total ' + (o.fmt || N1)(tot[i]), o.parts.map(p => ({ color: p.color, value: (o.fmt || N1)(o.data[i][p.key] || 0), label: p.name }))); };
      hit.addEventListener('pointermove', on); hit.addEventListener('pointerleave', () => { g.setAttribute('opacity', 1); tip.hide(); });
      hit.addEventListener('focus', () => { const r = hit.getBoundingClientRect(); on({ clientX: r.left + r.width / 2, clientY: r.top }); }); hit.addEventListener('blur', () => tip.hide());
      svg.append(g, hit);
    });
    el.append(legend(o.parts.map(p => ({ name: p.name, color: p.color }))), svg);
  }
  /** Barras horizontales con el valor en la punta. */
  function hbar(el, o) {
    const rows = o.rows, W = Math.max(280, el.clientWidth || 600), rh = 26, H = rows.length * rh + 6, lw = Math.min(170, W * .38), max = Math.max(...rows.map(r => r.val || 0), 1e-9);
    const svg = S('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': o.title || 'Barras' });
    const bw = W - lw - 70;
    rows.forEach((r, i) => {
      const y = 3 + i * rh, w = Math.max(r.val ? 2 : 0, (r.val || 0) / max * bw);
      svg.append(S('text', { x: lw - 8, y: y + 15, 'text-anchor': 'end' }, trunc(r.label, 26)));
      const bar = S('path', { d: rightRound(lw, y + 3, w, 17, 4), fill: o.color || 'var(--s1)' }); svg.append(bar);
      svg.append(S('text', { x: lw + w + 6, y: y + 16, class: 'vl' }, o.vfmt ? o.vfmt(r.val) : N1(r.val)));
      const hit = S('rect', { x: 0, y, width: W, height: rh, fill: 'transparent', tabindex: 0 });
      hit.addEventListener('pointermove', ev => { bar.setAttribute('opacity', .75); tip.show(ev, r.label, [{ value: o.vfmt ? o.vfmt(r.val) : N1(r.val), label: o.name || '' }, ...(r.extra || [])]); });
      hit.addEventListener('pointerleave', () => { bar.setAttribute('opacity', 1); tip.hide(); }); svg.append(hit);
    });
    el.append(svg);
  }
  /** Barras horizontales apiladas por categoría (desglose del tiempo). */
  function hstack(el, o) {
    const W = Math.max(300, el.clientWidth || 600), rh = 30, lw = Math.min(170, W * .3), H = o.rows.length * rh + 6, bw = W - lw - 60;
    const tot = o.rows.map(r => o.parts.reduce((s, p) => s + (r.data[p.key] || 0), 0)), max = Math.max(...tot, 1e-9);
    const svg = S('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': o.title || 'Barras apiladas' });
    o.rows.forEach((r, i) => {
      const y = 3 + i * rh; svg.append(S('text', { x: lw - 8, y: y + 17, 'text-anchor': 'end' }, trunc(r.label, 26)));
      let x = lw; const parts = o.parts.filter(p => (r.data[p.key] || 0) > 0), g = S('g');
      parts.forEach((p, j) => {
        const v = r.data[p.key], w = Math.max(1, v / max * bw - (j < parts.length - 1 ? 2 : 0));
        g.append(S('path', { d: j === parts.length - 1 ? rightRound(x, y + 3, w, 20, 4) : `M${x},${y + 3}h${w}v20h${-w}Z`, fill: p.color }));
        if (w > String(N1(v)).length * 7 + 10) g.append(S('text', { x: x + 6, y: y + 17, style: 'fill:' + (p.dark ? '#0b0b0b' : '#fff') + ';font-weight:600' }, N1(v)));
        x += v / max * bw;
      });
      svg.append(g, S('text', { x: x + 6, y: y + 17, class: 'vl' }, N1(tot[i]) + ' d'));
      const hit = S('rect', { x: 0, y, width: W, height: rh, fill: 'transparent' });
      hit.addEventListener('pointermove', ev => { g.setAttribute('opacity', .8); tip.show(ev, r.label + ' · ' + N1(tot[i]) + ' d', o.parts.map(p => ({ color: p.color, value: N1(r.data[p.key] || 0) + ' d', label: p.name }))); });
      hit.addEventListener('pointerleave', () => { g.setAttribute('opacity', 1); tip.hide(); }); svg.append(hit);
    });
    el.append(legend(o.parts.map(p => ({ name: p.name, color: p.color }))), svg);
  }

  const BKT_PARTS = BKT_ORDER.map(k => ({ key: k, name: M.BUCKET_LABEL[k], color: BKT[k], dark: k === 'aprobacion' }));
  const bucketsOf = ds => Object.fromEntries(BKT_ORDER.map(k => [k, M.mean(ds.filter(d => d.entregada || d.cerrada).map(d => d.buckets[k])) || 0]));

  // ---------- pestañas ----------
  const TABS = [['resumen', 'Resumen'], ['lead', 'Lead time'], ['resp', 'Respuesta del diseñador'], ['dev', 'Devoluciones y reprocesos'], ['pend', 'Pendientes'], ['det', 'Detalle'], ['cal', 'Calidad y método']];
  function renderTabs() { const nav = $('#tabs'); nav.replaceChildren(...TABS.map(([k, t]) => h('button', { class: st.tab === k ? 'on' : '', onclick: () => { st.tab = k; refresh(true); } }, t))); }

  function tabResumen(root) {
    const s = st.sum, ds = st.view, ms = M.monthSeries(ds), lbl = ms.map(x => mesLbl(x.mes));
    root.append(h('div', { class: 'grid g4' },
      tile('Lead time mediano: solicitud → cierre', s.ltCierre == null ? '—' : fmtD(s.ltCierre), `P90 ${fmtD(s.ltCierreP90)} · ${s.cerradas} cerradas (Finalizado)`, 'hero'),
      tile('Solicitudes', s.n, `${s.abiertas} abiertas · ${s.cerradas} cerradas`),
      tile('Solicitud → 1ª entrega', fmtD(s.ltEntrega), 'mediana, hasta Entregado o Finalizado'),
      tile('Tiempo neto de diseño', fmtD(s.neto), 'sin esperas por devolución ni pausa'),
      tile('Primera respuesta del diseñador', fmtD(s.primeraResp), 'mediana desde que se crea la solicitud'),
      tile('Con devolución', pct(s.pctDev), `${s.nDev} devoluciones en total`),
      tile('Entregadas a tiempo', pct(s.pctATiempo), 'vs Fecha Requerida (1ª entrega)'),
      tile('Vencidas sin entregar', s.vencidas, 'abiertas con Fecha Requerida pasada')));
    root.append(h('div', { class: 'grid g2', style: 'margin-top:14px' },
      card('Lead time mediano por mes de solicitud', 'Días; cada línea mide un tramo distinto del proceso', b => lineChart(b, { xs: lbl, endLabels: true, yfmt: v => N1(v) + ' d', series: [
        { name: 'Solicitud → cierre', color: 'var(--s1)', vals: ms.map(x => x.ltCierre) }, { name: 'Solicitud → 1ª entrega', color: 'var(--s2)', vals: ms.map(x => x.ltEntrega) }, { name: 'Neto de diseño', color: 'var(--s3)', vals: ms.map(x => x.neto) }] }),
        { cols: ['Mes', 'Cierre (d)', '1ª entrega (d)', 'Neto (d)'], rows: ms.map(x => [mesLbl(x.mes), N1(x.ltCierre), N1(x.ltEntrega), N1(x.neto)]) }),
      card('Solicitudes por mes', 'Según Fecha de Solicitud (o creación)', b => colChart(b, { labels: lbl, vals: ms.map(x => x.n), name: 'Solicitudes', title: 'Solicitudes por mes' }),
        { cols: ['Mes', 'Solicitudes', 'Cerradas'], rows: ms.map(x => [mesLbl(x.mes), x.n, x.cerradas]) }),
      card('¿Dónde se va el tiempo?', 'Promedio de días por solicitud entregada, por mes', b => stackChart(b, { labels: lbl, parts: BKT_PARTS, data: ms.map(x => ({ ...x.buckets })), fmt: v => N1(v) + ' d', title: 'Desglose del tiempo por mes' }),
        { cols: ['Mes', ...BKT_ORDER.map(k => M.BUCKET_LABEL[k] + ' (d)')], rows: ms.map(x => [mesLbl(x.mes), ...BKT_ORDER.map(k => N1(x.buckets[k]))]) }),
      card('Distribución del lead time hasta cierre', 'Número de solicitudes por rango de días', b => { const hg = M.histogram(ds.map(d => d.ltCierre), [0, 5, 10, 20, 30, 45, 60, 90]); colChart(b, { labels: hg.map(x => x.a == null ? x.de + '+' : x.de + '–' + x.a), vals: hg.map(x => x.n), name: 'Solicitudes', color: 'var(--s1)', title: 'Distribución del lead time' }); },
        { cols: ['Rango (d)', 'Solicitudes'], rows: M.histogram(ds.map(d => d.ltCierre), [0, 5, 10, 20, 30, 45, 60, 90]).map(x => [x.a == null ? x.de + '+' : x.de + '–' + x.a, x.n]) })));
  }

  function heatCell(v, max, f) {
    const t = v == null || !max ? 0 : Math.min(1, v / max), bg = v == null ? '' : `color-mix(in srgb, var(--seq450) ${Math.round(t * 55)}%, transparent)`;
    return h('td', { class: 'h', style: bg ? 'background:' + bg : '' }, f(v));
  }
  function tabLead(root) {
    const ds = st.view, rows = M.byDim(ds, st.dim);
    root.append(h('div', { class: 'card', style: 'margin-bottom:14px' }, h('span', { class: 'note' }, 'Desglosar por: '), h('select', { onchange: e => { st.dim = e.target.value; refresh(true); } }, DIMS.map(([k, t]) => h('option', { value: k, selected: st.dim === k }, t)))));
    root.append(h('div', { class: 'grid g2' },
      card('Tiempo por tramo según ' + DIMN[st.dim].toLowerCase(), 'Promedio de días por solicitud entregada', b => hstack(b, { parts: BKT_PARTS, rows: rows.slice(0, 14).map(r => ({ label: r.k, data: Object.fromEntries(BKT_ORDER.map(k => [k, r.buckets[k] || 0])) })), title: 'Tiempo por tramo' }),
        { cols: [DIMN[st.dim], ...BKT_ORDER.map(k => M.BUCKET_LABEL[k] + ' (d)')], rows: rows.map(r => [r.k, ...BKT_ORDER.map(k => N1(r.buckets[k]))]) }),
      card('Lead time mediano según ' + DIMN[st.dim].toLowerCase(), 'Solicitud → cierre, días', b => hbar(b, { rows: rows.filter(r => r.ltCierre != null).sort((a, c) => c.ltCierre - a.ltCierre).slice(0, 14).map(r => ({ label: r.k, val: r.ltCierre, extra: [{ value: r.cerradas, label: 'cerradas' }] })), vfmt: v => N1(v) + ' d', color: 'var(--s1)', name: 'Mediana', title: 'Lead time por dimensión' }),
        { cols: [DIMN[st.dim], 'Cierre (d)', 'Cerradas'], rows: rows.map(r => [r.k, N1(r.ltCierre), r.cerradas]) })));
    const mx = f => Math.max(...rows.map(r => r[f] || 0), 1e-9);
    const cols = [['Solicitudes', 'n', v => v, 0], ['Cierre (mediana)', 'ltCierre', fmtD], ['1ª entrega (mediana)', 'ltEntrega', fmtD], ['Neto de diseño', 'neto', fmtD], ['Info completa → entrega', 'infoAEntrega', fmtD], ['Con devolución', 'pctDev', pct], ['A tiempo', 'pctATiempo', pct]];
    root.append(h('div', { class: 'card', style: 'margin-top:14px' }, h('h3', {}, 'Comparativo por ' + DIMN[st.dim].toLowerCase()), h('div', { class: 'sub' }, 'El color más oscuro marca los valores más altos de cada columna'),
      h('div', { class: 'tw' }, h('table', { class: 'heat' }, h('thead', {}, h('tr', {}, h('th', {}, DIMN[st.dim]), cols.map(c => h('th', { class: 'n' }, c[0])))),
        h('tbody', {}, rows.map(r => h('tr', {}, h('td', {}, r.k), cols.map(c => c[1] === 'n' ? h('td', { class: 'n' }, r.n) : (c[1] === 'pctATiempo' ? h('td', { class: 'n' }, pct(r[c[1]])) : heatCell(r[c[1]], mx(c[1]), c[2]))))))))));
    root.append(h('div', { class: 'grid g2', style: 'margin-top:14px' },
      card('Solicitud → 1ª entrega', 'Número de solicitudes por rango de días', b => { const hg = M.histogram(ds.map(d => d.ltEntrega), [0, 3, 7, 14, 21, 30, 45]); colChart(b, { labels: hg.map(x => x.a == null ? x.de + '+' : x.de + '–' + x.a), vals: hg.map(x => x.n), color: 'var(--s2)', name: 'Solicitudes' }); }),
      card('Info completa → entrega (neto de diseño)', 'Días desde que quedó completa la información hasta la 1ª entrega', b => { const hg = M.histogram(ds.map(d => d.infoAEntrega), [0, 3, 7, 14, 21, 30, 45]); colChart(b, { labels: hg.map(x => x.a == null ? x.de + '+' : x.de + '–' + x.a), vals: hg.map(x => x.n), color: 'var(--s3)', name: 'Solicitudes' }); })));
  }

  function allComments(ds) { return ds.flatMap(d => d.coment.map(c => ({ d, ...c }))).sort((a, b) => b.fecha - a.fecha); }
  function tabResp(root) {
    const s = st.sum, ds = st.view, ms = M.monthSeries(ds), lbl = ms.map(x => mesLbl(x.mes)), cm = allComments(ds);
    const gaps = ds.flatMap(d => d.coment.slice(1).map((c, i) => M.span(d.coment[i].fecha, c.fecha, st.biz)));
    root.append(h('div', { class: 'grid g4' },
      tile('Primera respuesta (mediana)', fmtD(s.primeraResp), 'desde la solicitud hasta la 1ª acción del diseñador'),
      tile('Primera respuesta (P90)', fmtD(M.pctl(ds.map(d => d.primeraResp), .9)), '9 de cada 10 se atienden en menos de esto'),
      tile('Hasta pasar a “En Proceso”', fmtD(s.inicio), 'mediana desde la solicitud'),
      tile('Entre actualizaciones', fmtD(M.median(gaps)), 'mediana entre comentarios fechados'),
      tile('Esperando respuesta', s.sinResp, 'abiertas sin acción del diseñador desde el último movimiento'),
      tile('Sin actualizar', ds.filter(d => d.sinActualizar != null && d.sinActualizar > C.ALERTA_SIN_ACTUALIZAR_DIAS).length, `abiertas con más de ${C.ALERTA_SIN_ACTUALIZAR_DIAS} días sin comentario ni cambio`)));
    const tipos = [...M.groupBy(cm, c => c.tipo)].map(([k, g]) => ({ label: k, val: g.length })).sort((a, b) => b.val - a.val);
    const hgR = M.histogram(ds.map(d => d.primeraResp), [0, 1, 2, 3, 5, 10, 20]);
    root.append(h('div', { class: 'grid g2', style: 'margin-top:14px' },
      card('Primera respuesta por mes', 'Mediana y P90, días', b => lineChart(b, { xs: lbl, endLabels: true, yfmt: v => N1(v) + ' d', series: [{ name: 'Mediana', color: 'var(--s1)', vals: ms.map(x => x.primeraResp) }, { name: 'P90', color: 'var(--s2)', vals: ms.map(x => x.primeraRespP90) }] }),
        { cols: ['Mes', 'Mediana (d)', 'P90 (d)'], rows: ms.map(x => [mesLbl(x.mes), N1(x.primeraResp), N1(x.primeraRespP90)]) }),
      card('Distribución de la primera respuesta', 'Solicitudes por rango de días', b => colChart(b, { labels: hgR.map(x => x.a == null ? x.de + '+' : x.de + '–' + x.a), vals: hgR.map(x => x.n), name: 'Solicitudes', color: 'var(--s1)' }),
        { cols: ['Rango (d)', 'Solicitudes'], rows: hgR.map(x => [x.a == null ? x.de + '+' : x.de + '–' + x.a, x.n]) }),
      card('Qué dicen los comentarios del diseñador', 'Entradas fechadas por tipo (clasificación automática por palabras clave)', b => hbar(b, { rows: tipos, vfmt: v => v, color: 'var(--s3)', name: 'Entradas' }), { cols: ['Tipo', 'Entradas'], rows: tipos.map(t => [t.label, t.val]) }),
      card('Actualizaciones del diseñador por mes', 'Comentarios fechados, según su fecha', b => { const g = [...M.groupBy(cm, c => M.ym(c.fecha))].sort((a, c) => a[0] < c[0] ? -1 : 1); colChart(b, { labels: g.map(x => mesLbl(x[0])), vals: g.map(x => x[1].length), name: 'Entradas', color: 'var(--s3)' }); })));
    root.append(h('div', { class: 'card', style: 'margin-top:14px' }, h('h3', {}, 'Últimos comentarios del diseñador'), h('div', { class: 'sub' }, 'Clic en una fila para ver la línea de tiempo de la solicitud'),
      h('div', { class: 'tw' }, h('table', {}, h('thead', {}, h('tr', {}, ['Fecha', 'Solicitud', 'Tipo', 'Comentario'].map(t => h('th', {}, t)))),
        h('tbody', {}, cm.slice(0, 40).map(c => h('tr', { class: 'cl', onclick: () => openDrawer(c.d) }, h('td', {}, fecha(c.fecha)), h('td', {}, '#' + c.d.sol + ' ' + trunc(c.d.titulo, 38)), h('td', {}, h('span', { class: 'pill' }, c.tipo)), h('td', {}, trunc(c.texto, 160)))))))));
  }

  function tabDev(root) {
    const s = st.sum, ds = st.view, ms = M.monthSeries(ds), lbl = ms.map(x => mesLbl(x.mes)), cd = ds.filter(d => d.conDev);
    const durDev = ds.flatMap(d => d.respSol.filter(r => r.tipo === 'Devolución').map(r => r.dias));
    root.append(h('div', { class: 'grid g4' },
      tile('Solicitudes con devolución', pct(s.pctDev), `${cd.length} de ${s.n}`), tile('Devoluciones en total', s.nDev, 'veces que pasó a “Devuelto”'),
      tile('Tiempo en devolución (mediana)', fmtD(M.median(durDev)), 'espera por información del solicitante, incluye la reacción del diseñador'),
      tile('Reprocesos', ds.filter(d => d.reprocesos > 0).length, 'volvieron a diseño después de Entregado/Finalizado'),
      tile('Espera de aprobación (mediana)', fmtD(s.respSolAprob), 'tiempo en “Entregado” antes de cerrar')));
    const bySol = M.byDim(ds, 'solicitante').map(r => ({ label: r.k, val: r.pctDev || 0, extra: [{ value: r.n, label: 'solicitudes' }] })).sort((a, b) => b.val - a.val).slice(0, 12);
    const consultas = allComments(cd).filter(c => c.tipo === 'Consulta / pendiente');
    root.append(h('div', { class: 'grid g2', style: 'margin-top:14px' },
      card('Devoluciones por mes', 'Número de devoluciones según mes de solicitud', b => colChart(b, { labels: lbl, vals: ms.map(x => x.nDev), name: 'Devoluciones', color: 'var(--s2)' }), { cols: ['Mes', 'Devoluciones'], rows: ms.map(x => [mesLbl(x.mes), x.nDev]) }),
      card('% de solicitudes con devolución por mes', 'Sobre el total de solicitudes de cada mes', b => lineChart(b, { xs: lbl, endLabels: true, yfmt: v => Math.round(v * 100) + '%', series: [{ name: '% con devolución', color: 'var(--s2)', vals: ms.map(x => x.pctDev) }] }), { cols: ['Mes', '%'], rows: ms.map(x => [mesLbl(x.mes), pct(x.pctDev)]) }),
      card('% con devolución según solicitante', 'Quién necesita completar más información', b => hbar(b, { rows: bySol, vfmt: v => Math.round(v * 100) + '%', color: 'var(--s2)', name: '% con devolución' }), { cols: ['Solicitante', '% con devolución'], rows: bySol.map(r => [r.label, pct(r.val)]) }),
      card('Tiempo en devolución', 'Días que cada devolución estuvo abierta', b => { const hg = M.histogram(durDev, [0, 1, 3, 7, 14, 30]); colChart(b, { labels: hg.map(x => x.a == null ? x.de + '+' : x.de + '–' + x.a), vals: hg.map(x => x.n), name: 'Devoluciones', color: 'var(--s2)' }); })));
    root.append(h('div', { class: 'card', style: 'margin-top:14px' }, h('h3', {}, 'Solicitudes con devolución'), h('div', { class: 'sub' }, 'Secuencia de estados y último comentario de consulta'),
      h('div', { class: 'tw' }, h('table', {}, h('thead', {}, h('tr', {}, ['Solicitud', 'Solicitante', 'Devoluciones', 'Días devueltas', 'Estado', 'Recorrido'].map(t => h('th', {}, t)))),
        h('tbody', {}, cd.sort((a, b) => b.nDev - a.nDev).map(d => h('tr', { class: 'cl', onclick: () => openDrawer(d) }, h('td', {}, '#' + d.sol + ' ' + trunc(d.titulo, 36)), h('td', {}, d.solicitante), h('td', { class: 'n' }, d.nDev), h('td', { class: 'n' }, N1(d.buckets.solicitante)), h('td', {}, d.estado), h('td', {}, d.ev.map(e => e.estado).filter((x, i, a) => x !== a[i - 1]).join(' › ')))))))));
    if (consultas.length) root.append(h('p', { class: 'note' }, `${consultas.length} comentarios del diseñador en estas solicitudes se clasificaron como consulta o pendiente; ábrelas para leerlos.`));
  }

  const pill = (t, cls) => h('span', { class: 'pill ' + (cls || '') }, t);
  function sortable(cols, rows, key) {
    const sk = st.sort, get = (r, c) => c.v(r);
    const data = rows.slice().sort((a, b) => { const x = get(a, cols.find(c => c.k === sk.k) || cols[0]), y = get(b, cols.find(c => c.k === sk.k) || cols[0]); return (x == null) - (y == null) || (x > y ? 1 : x < y ? -1 : 0) * sk.dir; });
    return h('div', { class: 'tw' }, h('table', {}, h('thead', {}, h('tr', {}, cols.map(c => h('th', { class: 's' + (c.n ? ' n' : ''), onclick: () => { st.sort = { k: c.k, dir: sk.k === c.k ? -sk.dir : -1 }; refresh(true); } }, c.t + (sk.k === c.k ? (sk.dir > 0 ? ' ▲' : ' ▼') : ''))))),
      h('tbody', {}, data.map(r => h('tr', { class: 'cl', onclick: () => openDrawer(r) }, cols.map(c => h('td', { class: c.n ? 'n' : '' }, c.f ? c.f(r) : String(c.v(r) ?? '—'))))))));
  }
  function tabPend(root) {
    const ab = st.view.filter(d => !d.cerrada), venc = ab.filter(d => d.vencida), esperaD = ab.filter(d => d.holder === 'Diseñador'), esperaS = ab.filter(d => d.holder === 'Solicitante');
    root.append(h('div', { class: 'grid g4' }, tile('Abiertas', ab.length, 'no están en Finalizado'), tile('Vencidas', venc.length, 'Fecha Requerida pasada y sin entregar'), tile('Con el diseñador', esperaD.length, 'Recibido, Programado, En Proceso'), tile('Con el solicitante', esperaS.length, 'Devuelto o Entregado (falta aprobar)'),
      tile('Sin actualizar', ab.filter(d => d.sinActualizar != null && d.sinActualizar > C.ALERTA_SIN_ACTUALIZAR_DIAS).length, `más de ${C.ALERTA_SIN_ACTUALIZAR_DIAS} días`)));
    const bySt = [...M.groupBy(ab, d => d.estado)].map(([k, g]) => ({ label: k, val: g.length, extra: [{ value: N1(M.median(g.map(d => d.diasEnEstado))) + ' d', label: 'mediana en el estado' }] })).sort((a, b) => b.val - a.val);
    root.append(h('div', { class: 'grid g2', style: 'margin-top:14px' },
      card('Abiertas por estado', 'Cantidad de solicitudes', b => hbar(b, { rows: bySt, vfmt: v => v, color: 'var(--s1)', name: 'Solicitudes' }), { cols: ['Estado', 'Solicitudes'], rows: bySt.map(r => [r.label, r.val]) }),
      card('Antigüedad de las abiertas', 'Días desde la solicitud', b => { const hg = M.histogram(ab.map(d => d.edad), [0, 7, 14, 30, 60, 90]); colChart(b, { labels: hg.map(x => x.a == null ? x.de + '+' : x.de + '–' + x.a), vals: hg.map(x => x.n), name: 'Solicitudes', color: 'var(--s4)' }); })));
    const cols = [{ k: 'sol', t: 'ID', v: d => +d.sol, n: 1 }, { k: 'titulo', t: 'Título', v: d => d.titulo }, { k: 'solicitante', t: 'Solicitante', v: d => d.solicitante }, { k: 'estado', t: 'Estado', v: d => d.estado },
      { k: 'holder', t: 'Con', v: d => d.holder }, { k: 'edad', t: 'Edad (d)', v: d => d.edad, n: 1, f: d => N1(d.edad) }, { k: 'diasEnEstado', t: 'En el estado (d)', v: d => d.diasEnEstado, n: 1, f: d => N1(d.diasEnEstado) },
      { k: 'sinActualizar', t: 'Sin actualizar (d)', v: d => d.sinActualizar, n: 1, f: d => N1(d.sinActualizar) }, { k: 'req', t: 'Fecha requerida', v: d => d.req, f: d => fecha(d.req) },
      { k: 'diasVencida', t: 'Vencida', v: d => d.diasVencida, n: 1, f: d => d.vencida ? pill(N1(d.diasVencida) + ' d de atraso', 'bad') : '' }];
    root.append(h('div', { class: 'card', style: 'margin-top:14px' }, h('h3', {}, 'Solicitudes abiertas'), h('div', { class: 'sub' }, 'Clic en un encabezado para ordenar; clic en una fila para ver el detalle'), sortable(cols, ab)));
  }

  function tabDet(root) {
    const cols = [{ k: 'sol', t: 'ID', v: d => +d.sol, n: 1 }, { k: 't0', t: 'Solicitud', v: d => d.t0, f: d => fecha(d.t0) }, { k: 'titulo', t: 'Título', v: d => d.titulo }, { k: 'solicitante', t: 'Solicitante', v: d => d.solicitante }, { k: 'area', t: 'Área', v: d => d.area },
      { k: 'estado', t: 'Estado', v: d => d.estado }, { k: 'ltEntrega', t: '1ª entrega (d)', v: d => d.ltEntrega, n: 1, f: d => N1(d.ltEntrega) }, { k: 'ltCierre', t: 'Cierre (d)', v: d => d.ltCierre, n: 1, f: d => N1(d.ltCierre) },
      { k: 'netoEntrega', t: 'Neto (d)', v: d => d.netoEntrega, n: 1, f: d => N1(d.netoEntrega) }, { k: 'primeraResp', t: '1ª respuesta (d)', v: d => d.primeraResp, n: 1, f: d => N1(d.primeraResp) },
      { k: 'nDev', t: 'Devol.', v: d => d.nDev, n: 1 }, { k: 'aTiempo', t: 'A tiempo', v: d => d.aTiempo == null ? null : +d.aTiempo, f: d => d.aTiempo == null ? '—' : d.aTiempo ? pill('Sí', 'ok') : pill(N1(d.atraso) + ' d tarde', 'bad') }];
    root.append(h('div', { class: 'card' }, h('span', { class: 'tools' }, h('button', { onclick: () => exportCsv() }, 'Exportar CSV')), h('h3', {}, `Detalle (${st.view.length} solicitudes)`), h('div', { class: 'sub' }, 'Respeta todos los filtros. Clic en una fila para ver su línea de tiempo y comentarios.'), sortable(cols, st.view)));
  }
  function exportCsv() {
    const hdr = ['ID', 'Titulo', 'Solicitante', 'Area', 'Marca', 'Destino', 'TipoProceso', 'TipoDiseno', 'Urgencia', 'Estado', 'FechaSolicitud', 'FechaRequerida', 'LeadTimeCierre_d', 'LeadTime1raEntrega_d', 'NetoDiseno_d', 'PrimeraRespuesta_d', 'Devoluciones', 'Reprocesos', 'ATiempo', 'AtrasoEntrega_d'];
    const rows = st.view.map(d => [d.sol, d.titulo, d.solicitante, d.area, d.marca, d.destino, d.tproc, d.tdis, d.urg, d.estado, fecha(d.t0), fecha(d.req), d.ltCierre, d.ltEntrega, d.netoEntrega, d.primeraResp, d.nDev, d.reprocesos, d.aTiempo, d.atraso]
      .map(x => x == null ? '' : '"' + String(typeof x === 'number' ? Math.round(x * 100) / 100 : x).replace(/"/g, '""') + '"'));
    const blob = new Blob(['﻿' + [hdr.join(','), ...rows.map(r => r.join(','))].join('\n')], { type: 'text/csv' });
    const a = h('a', { href: URL.createObjectURL(blob), download: 'solicitudes_mkt_' + M.ymd(Date.now()) + '.csv' }); a.click();
  }

  function tabCal(root) {
    const ds = st.view, probs = {}; ds.forEach(d => d.calidad.forEach(c => (probs[c] = probs[c] || []).push(d)));
    const rows = Object.entries(probs).sort((a, b) => b[1].length - a[1].length);
    root.append(h('div', { class: 'grid g2' },
      card('Calidad de los datos', 'Campos que faltan y distorsionan las métricas', b => hbar(b, { rows: rows.map(([k, g]) => ({ label: k, val: g.length })), vfmt: v => v, color: 'var(--s4)', name: 'Solicitudes' }), { cols: ['Problema', 'Solicitudes'], rows: rows.map(([k, g]) => [k, g.length]) }),
      h('div', { class: 'card' }, h('h3', {}, 'Cómo se calcula cada métrica'), h('div', { class: 'sub' }, 'Todo sale del historial de versiones de la lista; no depende de que se llenen fechas a mano'),
        h('ul', { class: 'note', style: 'padding-left:18px;line-height:1.6' },
          h('li', {}, h('b', {}, 'Cierre: '), 'momento en que la solicitud pasó a Finalizado (la última vez, si se reabrió).'),
          h('li', {}, h('b', {}, '1ª entrega: '), 'primera vez en Entregado o Finalizado (si no hay historial, Fecha Entregada).'),
          h('li', {}, h('b', {}, 'Neto de diseño: '), '1ª entrega menos el tiempo en Devuelto y En Pausa. Mide el trabajo del diseñador, sin las esperas por información.'),
          h('li', {}, h('b', {}, 'Info completa → entrega: '), 'desde que terminó la última devolución (o la solicitud) hasta la 1ª entrega.'),
          h('li', {}, h('b', {}, 'Primera respuesta: '), 'desde la creación hasta la primera versión guardada por alguien de la lista de diseñadores.'),
          h('li', {}, h('b', {}, 'En cola / Diseño / Devuelto / Aprobación: '), 'tiempo acumulado en Recibido+Programado, En Proceso, Devuelto y Entregado.'),
          h('li', {}, h('b', {}, 'A tiempo: '), '1ª entrega en o antes de la Fecha Requerida (por fecha, sin horas).'),
          h('li', {}, h('b', {}, 'Comentarios: '), 'líneas que empiezan con fecha (dd/mm/aaaa) en “Comentario diseñador”. El tipo se asigna por palabras clave y es orientativo.'),
          h('li', {}, h('b', {}, 'Limitación: '), 'en la lista solo el diseñador guarda cambios, así que el tiempo en Devuelto incluye la espera por el solicitante y la reacción del diseñador; no se pueden separar.'),
          h('li', {}, h('b', {}, 'Días hábiles: '), 'lunes a viernes sin los feriados de config.js.')))));
    root.append(h('div', { class: 'card', style: 'margin-top:14px' }, h('h3', {}, 'Solicitudes con datos incompletos'), h('div', { class: 'tw' }, h('table', {}, h('thead', {}, h('tr', {}, ['Solicitud', 'Problemas'].map(t => h('th', {}, t)))),
      h('tbody', {}, ds.filter(d => d.calidad.length).map(d => h('tr', { class: 'cl', onclick: () => openDrawer(d) }, h('td', {}, '#' + d.sol + ' ' + trunc(d.titulo, 50)), h('td', {}, d.calidad.join(' · ')))))))));
  }

  // ---------- detalle de una solicitud ----------
  function openDrawer(d) {
    const dr = $('#drawer'); dr.replaceChildren();
    const t0 = d.t0, t1 = Math.max(d.iv.length ? d.iv[d.iv.length - 1].to : t0 + 1, t0 + 1), W = 500, rowH = 22;
    const svg = S('svg', { viewBox: `0 0 ${W} 54`, width: '100%', role: 'img', 'aria-label': 'Línea de tiempo de estados' });
    d.iv.forEach(x => { const a = 10 + (x.from - t0) / (t1 - t0) * (W - 20), w = Math.max(3, (x.to - x.from) / (t1 - t0) * (W - 20) - 2);
      const r = S('rect', { x: a, y: 8, width: w, height: 22, rx: 3, fill: BKT[x.bucket] }); r.addEventListener('pointermove', ev => tip.show(ev, x.estado, [{ value: N1(x.dias) + ' d', label: fecha(x.from) + ' → ' + (x.open ? 'hoy' : fecha(x.to)) }])); r.addEventListener('pointerleave', tip.hide); svg.append(r); });
    svg.append(S('text', { x: 10, y: 48 }, fecha(t0)), S('text', { x: W - 10, y: 48, 'text-anchor': 'end' }, d.cerrada ? fecha(d.cierre) : 'hoy'));
    dr.append(h('button', { style: 'float:right', onclick: () => dr.classList.remove('open') }, 'Cerrar'), h('h2', {}, '#' + d.sol + ' ' + d.titulo),
      h('div', {}, pill(d.estado), ' ', d.cerrada ? null : pill('Con: ' + d.holder), d.vencida ? [' ', pill('Vencida ' + N1(d.diasVencida) + ' d', 'bad')] : null),
      h('div', { class: 'kv' }, ...[['Solicitante', d.solicitante], ['Área', d.area], ['Marca / Destino', d.marca + ' / ' + d.destino], ['Tipo', d.tproc + ' · ' + d.tdis], ['Solicitud', fecha(d.t0)], ['Fecha requerida', fecha(d.req)],
        ['1ª entrega', d.entrega1 ? fecha(d.entrega1) : '—'], ['Cierre', d.cerrada ? fecha(d.cierre) : '—'], ['Lead time a cierre', fmtD(d.ltCierre)], ['Lead time a 1ª entrega', fmtD(d.ltEntrega)], ['Neto de diseño', fmtD(d.netoEntrega)], ['Primera respuesta', fmtD(d.primeraResp)],
        ['Devoluciones', d.nDev], ['Reprocesos', d.reprocesos]].flatMap(([k, v]) => [h('span', {}, k), h('span', {}, String(v ?? '—'))])),
      legend(BKT_ORDER.filter(k => d.buckets[k] > 0).map(k => ({ name: M.BUCKET_LABEL[k] + ' · ' + N1(d.buckets[k]) + ' d', color: BKT[k] }))), svg,
      h('h3', {}, 'Cambios de estado'), ...d.ev.filter(e => e.cambioEstado).map(e => h('div', { class: 'cm' }, h('b', {}, e.estado), ' ', h('small', {}, fecha(e.ts) + ' · ' + (e.editor || '—')))),
      h('h3', {}, 'Comentarios del diseñador'), h('div', {}, d.coment.length ? d.coment.map(c => h('div', { class: 'cm' }, h('small', {}, fecha(c.fecha) + ' · ' + c.tipo), h('div', {}, c.texto))) : h('p', { class: 'note' }, 'Sin comentarios fechados.')));
    dr.classList.add('open');
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape') $('#drawer').classList.remove('open'); });

  // ---------- render ----------
  const TABFN = { resumen: tabResumen, lead: tabLead, resp: tabResp, dev: tabDev, pend: tabPend, det: tabDet, cal: tabCal };
  function renderMain() {
    const root = $('#main'); root.replaceChildren();
    if (!st.view.length) { root.append(h('div', { class: 'card' }, 'No hay solicitudes con estos filtros.')); return; }
    TABFN[st.tab](root);
  }
  function refresh(keepFilters) {
    recompute(); if (!keepFilters || !$('#filters').children.length) buildFilters(); else $('#cnt').textContent = '';
    $('#cnt') && ($('#cnt').textContent = `${st.view.length} de ${st.all.length} solicitudes`);
    renderTabs(); renderMain();
  }
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(renderMain, 200); });

  // ---------- arranque ----------
  function msg(title, ...kids) { $('#main').replaceChildren(h('div', { class: 'card msg' }, h('h2', {}, title), ...kids)); }
  async function load() {
    const main = $('#main'); main.classList.add('busy');
    try {
      st.recs = DEMO ? window.MKT_DEMO(Date.now()) : await window.MKTData.fetchAll(t => $('#upd').textContent = t);
      st.now = Date.now(); $('#upd').textContent = (DEMO ? 'DATOS DE DEMOSTRACIÓN (inventados) · ' : 'Datos de SharePoint · ') + 'actualizado ' + new Date().toLocaleString('es-CR');
      refresh();
    } catch (e) { console.error(e); if (!st.recs.length) msg('No se pudieron leer los datos', h('p', { class: 'err' }, e.message)); else $('#upd').textContent = 'Error al actualizar: ' + e.message; }
    main.classList.remove('busy');
  }
  async function start() {
    $('#bBiz').onclick = e => { st.biz = !st.biz; e.target.classList.toggle('on', st.biz); refresh(true); };
    $('#bTheme').onclick = () => { const r = document.documentElement, dark = (r.dataset.theme || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light')) === 'dark'; r.dataset.theme = dark ? 'light' : 'dark'; renderMain(); };
    $('#bRef').onclick = load;
    if (DEMO) { await load(); setInterval(() => document.hidden || load(), C.REFRESH_MIN * 6e4); return; }
    if (/PEGAR-/.test(C.CLIENT_ID)) { $('#upd').textContent = 'Falta configurar'; return msg('Falta registrar la aplicación en Microsoft Entra', h('p', {}, 'Abre ', h('code', {}, 'config.js'), ' y pega el Id de aplicación (ver README, paso 1).'), h('p', {}, h('a', { href: '?demo=1' }, 'Ver con datos de demostración'))); }
    await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/@azure/msal-browser@2.38.3/lib/msal-browser.min.js'; s.onload = ok; s.onerror = () => no(new Error('No se pudo cargar MSAL')); document.head.append(s); });
    const acc = await window.MKTData.init();
    if (!acc) { $('#upd').textContent = 'Sin sesión'; return msg('Inicia sesión con tu cuenta de Brinova', h('p', {}, 'Los datos se leen en vivo de SharePoint con tu propio permiso; nada se guarda en GitHub.'), h('button', { class: 'on', onclick: () => window.MKTData.login() }, 'Iniciar sesión con Microsoft')); }
    $('#who').textContent = acc.name || acc.username; $('#bOut').style.display = ''; $('#bOut').onclick = () => window.MKTData.logout();
    await load(); setInterval(() => document.hidden || load(), C.REFRESH_MIN * 6e4);
  }
  start();
})();
