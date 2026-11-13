/* Analítica de Solicitudes a MKT. Funciones puras (sin DOM, sin red): se prueban con Node y corren en el navegador.
   Entrada: registros normalizados (ver data.js). Salida: métricas por solicitud + agregados. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MKT = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const DAY = 864e5, HOUR = 36e5;
  const CFG = { tz: -6, designers: [], feriados: [] };
  const setConfig = c => Object.assign(CFG, c);

  // ---------- fechas (hora local de Costa Rica) ----------
  const loc = ms => new Date(ms + CFG.tz * HOUR);
  const ymd = ms => { const d = loc(ms); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0'); };
  const ym = ms => ymd(ms).slice(0, 7);
  const isBiz = t => { const d = new Date(t), w = d.getUTCDay(); return !(w === 0 || w === 6 || CFG.feriados.includes(d.toISOString().slice(0, 10))); };
  /** Días entre a y b (ms UTC). biz=true cuenta solo lunes–viernes sin feriados. */
  function span(a, b, biz) {
    if (a == null || b == null) return null;
    if (b <= a) return 0;
    if (!biz) return (b - a) / DAY;
    const A = a + CFG.tz * HOUR, B = b + CFG.tz * HOUR;
    let t = Math.floor(A / DAY) * DAY, tot = 0;
    while (t < B) { const s = Math.max(t, A), e = Math.min(t + DAY, B); if (isBiz(t)) tot += e - s; t += DAY; }
    return tot / DAY;
  }
  // diferencia de fechas calendario (sin hora): para "entregó antes de la fecha requerida"
  const dateIdx = ms => Date.parse(ymd(ms) + 'T00:00:00Z');
  function dayDiff(a, b, biz) { // b - a en días, por fecha local; negativo si b < a
    if (dateIdx(b) <= dateIdx(a)) return -spanDates(dateIdx(b), dateIdx(a), biz);
    return spanDates(dateIdx(a), dateIdx(b), biz);
  }
  function spanDates(a, b, biz) {
    let n = 0; for (let t = a + DAY; t <= b; t += DAY) if (!biz || isBiz(t)) n++; return n;
  }

  // ---------- estadísticas ----------
  const nums = a => a.filter(x => x != null && !isNaN(x));
  const sum = a => nums(a).reduce((s, x) => s + x, 0);
  const mean = a => { a = nums(a); return a.length ? sum(a) / a.length : null; };
  function pctl(a, p) { a = nums(a).sort((x, y) => x - y); if (!a.length) return null; const i = (a.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return a[lo] + (a[hi] - a[lo]) * (i - lo); }
  const median = a => pctl(a, .5);

  // ---------- estados ----------
  const BUCKET = { 'Recibido': 'cola', 'Programado': 'cola', 'En Proceso': 'diseno', 'Devuelto': 'solicitante', 'Entregado': 'aprobacion', 'En Pausa': 'pausa', 'Finalizado': 'cerrado' };
  const BUCKET_LABEL = { cola: 'En cola (diseñador)', diseno: 'Diseño activo', solicitante: 'Devuelto al solicitante', aprobacion: 'Entregado, esperando aprobación', pausa: 'En pausa' };
  const HOLDER = { cola: 'Diseñador', diseno: 'Diseñador', solicitante: 'Solicitante', aprobacion: 'Solicitante', pausa: 'En pausa', cerrado: '—' };

  /** Colapsa versiones idénticas (SharePoint crea versiones sin cambios reales). */
  function events(rec) {
    const vs = rec.versions.filter(v => v.ts != null).slice().sort((a, b) => a.ts - b.ts);
    const out = []; let key0 = null, prevEstado = null;
    for (const v of vs) {
      const estado = v.estado || prevEstado || 'Recibido';
      const key = [estado, v.com || '', v.fent || '', v.fapr || ''].join('|');
      if (key !== key0) {
        out.push({ ts: v.ts, editor: v.editor || '', estado, com: v.com || '', cambioEstado: estado !== prevEstado, rol: CFG.designers.includes(v.editor) ? 'D' : 'S' });
        key0 = key; prevEstado = estado;
      }
    }
    return out;
  }

  // ---------- log de comentarios del diseñador (texto con líneas fechadas dd/mm/aaaa) ----------
  const RE_FECHA = /^\s*(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\s*[,:;\-–—]*\s*(.*)$/;
  function tipoComentario(t) {
    if (/pendiente|falta|consulta|requiere|favor|confirmaci[oó]n|por confirmar|esperando|sin respuesta|dudas?/i.test(t)) return 'Consulta / pendiente';
    if (/aprob|visto bueno|\bok\b|conforme/i.test(t)) return 'Aprobación';
    if (/se env[ií]a|se comparte|compartid|se adjunta|enviado|se entrega|entrega de arte|se sube|arte (listo|final)|archivo actualizado|actualizado en|revisi[oó]n lista/i.test(t)) return 'Envío de arte';
    return 'Actualización';
  }
  function parseComentarios(texto) {
    const out = []; let cur = null;
    for (const line of String(texto || '').split(/\r?\n/)) {
      const m = line.match(RE_FECHA);
      if (m) {
        let y = +m[3]; if (y < 100) y += 2000;
        cur = { fecha: Date.UTC(y, +m[2] - 1, +m[1]) - CFG.tz * HOUR, texto: m[4].trim() };
        out.push(cur);
      } else if (cur && line.trim()) cur.texto += ' ' + line.trim();
    }
    out.forEach(c => c.tipo = tipoComentario(c.texto));
    return out;
  }

  // ---------- métricas por solicitud ----------
  function derive(rec, now, biz) {
    const ev = events(rec);
    const d = { rec, ev, ok: ev.length > 0 };
    Object.assign(d, {
      id: rec.id, sol: rec.sol, titulo: rec.titulo, solicitante: rec.solicitante || '—', area: rec.area || '—', urg: rec.urg || '—',
      marca: rec.marca || '—', destino: rec.destino || '—', tproc: rec.tproc || '—', tdis: rec.tdis || '—', proveedor: rec.proveedor || '—',
      estado: ev.length ? ev[ev.length - 1].estado : (rec.estado || 'Recibido'),
    });
    if (!ev.length) return d;
    const created = ev[0].ts;
    let t0 = created;
    if (rec.fSol != null && rec.fSol < created && ymd(rec.fSol) !== ymd(created)) t0 = rec.fSol;
    d.t0 = t0; d.mes = ym(t0);

    // intervalos por estado
    const B = { cola: 0, diseno: 0, solicitante: 0, aprobacion: 0, pausa: 0 };
    const iv = [];
    ev.forEach((e, i) => {
      const from = i === 0 ? t0 : e.ts, to = i < ev.length - 1 ? ev[i + 1].ts : now;
      const b = BUCKET[e.estado] || 'cola';
      if (b === 'cerrado') return;
      iv.push({ estado: e.estado, bucket: b, from, to, open: i === ev.length - 1 });
    });
    iv.forEach(x => { x.dias = span(x.from, x.to, biz); B[x.bucket] += x.dias; });
    d.iv = iv; d.buckets = B;

    // cierre = inicio de la última racha en Finalizado
    const last = ev[ev.length - 1];
    d.cerrada = last.estado === 'Finalizado';
    if (d.cerrada) { let i = ev.length - 1; while (i > 0 && ev[i - 1].estado === 'Finalizado') i--; d.cierre = ev[i].ts; }
    const eE = ev.find(e => e.estado === 'Entregado' || e.estado === 'Finalizado');
    d.entrega1 = eE ? eE.ts : (rec.fEnt != null ? rec.fEnt : null);
    d.entregada = d.entrega1 != null;
    d.ltCierre = d.cerrada ? span(t0, d.cierre, biz) : null;
    d.ltEntrega = d.entregada ? span(t0, d.entrega1, biz) : null;

    // devoluciones: rachas de "Devuelto"
    const rachas = []; ev.forEach((e, i) => { if (e.estado === 'Devuelto' && (i === 0 || ev[i - 1].estado !== 'Devuelto')) rachas.push(i); });
    d.nDev = rachas.length; d.conDev = d.nDev > 0;
    d.reprocesos = ev.filter((e, i) => i && ['En Proceso', 'Programado', 'Devuelto'].includes(e.estado) && ['Entregado', 'Finalizado'].includes(ev[i - 1].estado)).length;
    // tiempo neto hasta primera entrega: quita devolución y pausa
    if (d.entregada) {
      let dev = 0, pau = 0, infoCompleta = t0;
      iv.forEach(x => {
        if (x.from >= d.entrega1) return;
        const to = Math.min(x.to, d.entrega1), dd = span(x.from, to, biz);
        if (x.bucket === 'solicitante') { dev += dd; infoCompleta = to; }
        if (x.bucket === 'pausa') pau += dd;
      });
      d.devAntesEntrega = dev; d.pausaAntesEntrega = pau;
      d.netoEntrega = Math.max(0, d.ltEntrega - dev - pau);
      d.infoCompleta = infoCompleta;
      d.infoAEntrega = span(infoCompleta, d.entrega1, biz); // desde que la info quedó completa hasta la entrega
    }

    // respuesta del diseñador: en esta lista TODOS los cambios de estado los registra el diseñador (el solicitante no edita),
    // así que "respuesta" se mide con las marcas de tiempo de las versiones y con la duración de cada estado.
    const resp = [];
    let esperaD = true, desde = ev[0].ts;
    d.primeraResp = null;
    for (let i = 1; i < ev.length; i++) {
      const e = ev[i];
      if (e.rol === 'D') {
        if (esperaD) { const x = span(desde, e.ts, biz); resp.push({ de: desde, a: e.ts, dias: x }); if (d.primeraResp == null) d.primeraResp = x; esperaD = false; }
      } else if (!esperaD) { esperaD = true; desde = e.ts; }
    }
    d.resp = resp;
    d.respMedia = mean(resp.map(r => r.dias));
    d.esperaDiseno = esperaD;           // sin ninguna acción del diseñador desde la última acción del solicitante
    d.esperaDesde = esperaD ? desde : null;
    const eP = ev.find(e => e.estado === 'En Proceso');
    d.inicioDiseno = eP ? span(t0, eP.ts, biz) : null;   // solicitud -> pasa a "En Proceso"
    // esperas del lado del solicitante: Devuelto (falta información) y Entregado (espera de aprobación)
    d.respSol = iv.filter(x => x.bucket === 'solicitante' || x.bucket === 'aprobacion')
      .map(x => ({ de: x.from, a: x.to, dias: x.dias, abierta: x.open, tipo: x.bucket === 'solicitante' ? 'Devolución' : 'Aprobación' }));

    // comentarios
    d.coment = parseComentarios(last.com || rec.comFinal);
    d.nComent = d.coment.length;
    d.primerComent = d.coment.length ? span(t0, d.coment[0].fecha, biz) : null;
    const lastD = [...ev].reverse().find(e => e.rol === 'D');
    const lastAct = Math.max(lastD ? lastD.ts : 0, d.coment.length ? d.coment[d.coment.length - 1].fecha : 0) || null;
    d.ultimaAct = lastAct;
    d.sinActualizar = !d.cerrada && lastAct ? span(lastAct, now, biz) : null;

    // estado actual / quién tiene la bola
    let c = ev.length - 1; while (c > 0 && ev[c - 1].estado === last.estado) c--;
    d.desdeEstado = ev[c].ts; d.diasEnEstado = span(ev[c].ts, now, biz);
    d.bucketActual = BUCKET[last.estado] || 'cola'; d.holder = HOLDER[d.bucketActual];
    d.edad = d.cerrada ? null : span(t0, now, biz);

    // cumplimiento vs fecha requerida
    // "A tiempo" se mide contra la PRIMERA entrega del arte (no contra el cierre, que depende de la aprobación del solicitante)
    const ref = d.entrega1;
    d.req = rec.fReq;
    if (rec.fReq != null && ref != null) { d.atraso = Math.max(0, dayDiff(rec.fReq, ref, biz)); d.aTiempo = d.atraso === 0; }
    else { d.atraso = null; d.aTiempo = null; }
    d.vencida = rec.fReq != null && !d.entregada && now > rec.fReq + DAY;
    d.diasVencida = d.vencida ? dayDiff(rec.fReq, now, biz) : null;
    if (rec.fEst != null && d.entrega1 != null) d.desvEst = dayDiff(rec.fEst, d.entrega1, biz); else d.desvEst = null;

    // calidad de datos
    d.calidad = [];
    if (rec.fSol == null) d.calidad.push('Sin Fecha de Solicitud');
    if (rec.fReq == null) d.calidad.push('Sin Fecha Requerida');
    if (d.estado === 'Finalizado' && rec.fEnt == null) d.calidad.push('Finalizado sin Fecha Entregada');
    if (d.estado === 'Entregado' && rec.fEnt == null) d.calidad.push('Entregado sin Fecha Entregada');
    if (rec.fEst == null && d.estado !== 'Finalizado') d.calidad.push('Sin Fecha Estimada');
    if (!d.coment.length) d.calidad.push('Sin comentarios fechados del diseñador');
    return d;
  }

  const deriveAll = (recs, now, biz) => recs.map(r => derive(r, now, biz)).filter(d => d.ok);

  // ---------- agregados ----------
  function groupBy(arr, keyFn) { const m = new Map(); arr.forEach(x => { const k = keyFn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }); return m; }
  function summary(ds) {
    const resp = ds.flatMap(d => d.resp.map(r => r.dias));
    const respSolDev = ds.flatMap(d => d.respSol.filter(r => r.tipo === 'Devolución' && !r.abierta).map(r => r.dias));
    const respSolAprob = ds.flatMap(d => d.respSol.filter(r => r.tipo === 'Aprobación' && !r.abierta).map(r => r.dias));
    const ent = ds.filter(d => d.aTiempo != null);
    return {
      n: ds.length, cerradas: ds.filter(d => d.cerrada).length, abiertas: ds.filter(d => !d.cerrada).length,
      ltCierre: median(ds.map(d => d.ltCierre)), ltCierreMedia: mean(ds.map(d => d.ltCierre)), ltCierreP90: pctl(ds.map(d => d.ltCierre), .9),
      ltEntrega: median(ds.map(d => d.ltEntrega)), neto: median(ds.map(d => d.netoEntrega)), infoAEntrega: median(ds.map(d => d.infoAEntrega)),
      devAntes: mean(ds.filter(d => d.entregada).map(d => d.devAntesEntrega)),
      pctDev: ds.length ? ds.filter(d => d.conDev).length / ds.length : null, nDev: sum(ds.map(d => d.nDev)),
      pctRepro: ds.length ? ds.filter(d => d.reprocesos > 0).length / ds.length : null,
      primeraResp: median(ds.map(d => d.primeraResp)), primeraRespP90: pctl(ds.map(d => d.primeraResp), .9), respMediana: median(resp), respP90: pctl(resp, .9), respSolDev: median(respSolDev), respSolAprob: median(respSolAprob), inicio: median(ds.map(d => d.inicioDiseno)),
      pctATiempo: ent.length ? ent.filter(d => d.aTiempo).length / ent.length : null, atrasoMedio: mean(ent.filter(d => !d.aTiempo).map(d => d.atraso)),
      vencidas: ds.filter(d => d.vencida).length, sinResp: ds.filter(d => !d.cerrada && d.esperaDiseno).length,
      buckets: Object.fromEntries(Object.keys(BUCKET_LABEL).map(k => [k, mean(ds.filter(d => d.entregada || d.cerrada).map(d => d.buckets[k]))])),
    };
  }
  function monthSeries(ds) {
    return [...groupBy(ds, d => d.mes)].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([mes, g]) => ({ mes, ...summary(g) }));
  }
  function byDim(ds, key) {
    return [...groupBy(ds, d => d[key])].map(([k, g]) => ({ k, ...summary(g) })).sort((a, b) => b.n - a.n);
  }
  function histogram(vals, edges) { // edges: [0,2,5,...] último abierto
    const c = edges.map(() => 0); nums(vals).forEach(v => { let i = edges.length - 1; for (let j = 0; j < edges.length - 1; j++) if (v < edges[j + 1]) { i = j; break; } c[i]++; });
    return c.map((n, i) => ({ de: edges[i], a: edges[i + 1] ?? null, n }));
  }

  const fmtD = x => x == null ? '—' : x < 1 ? Math.round(x * 24) + ' h' : (Math.round(x * 10) / 10).toString().replace('.', ',') + ' d';
  const pct = x => x == null ? '—' : Math.round(x * 100) + '%';

  return { DAY, HOUR, setConfig, CFG, span, dayDiff, ymd, ym, events, parseComentarios, derive, deriveAll, summary, monthSeries, byDim, groupBy, histogram,
    median, mean, pctl, sum, fmtD, pct, BUCKET, BUCKET_LABEL, HOLDER };
});
