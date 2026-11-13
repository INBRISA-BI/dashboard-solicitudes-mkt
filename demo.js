/* Datos SINTÉTICOS (inventados) para probar el diseño con ?demo=1. No contienen información real. */
window.MKT_DEMO = function (now) {
  let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const pick = a => a[Math.floor(rnd() * a.length)], DAY = 864e5, H = 36e5;
  const personas = ['Ana Solano', 'Luis Mora', 'Karla Vega', 'Diego Rojas', 'Marta Jiménez'];
  const areas = ['Operaciones', 'Operaciones', 'Operaciones', 'Innovación', 'Exportación', 'Comercial'];
  const marcas = ['BRINOVA', 'Contraste', 'Alabrill', 'Like', 'Ultralimp'];
  const dests = ['Automercado', 'Walmart Costa Rica', 'Canal Tradicional', 'Feduro Panamá', 'Codisa Guatemala'];
  const tprocs = ['Nuevo Diseño', 'Rediseño', 'Modificación', 'Adaptación'];
  const tdis = ['Bolsas', 'Cajas', 'Sticker', 'Fundas', 'Anuncios', 'Campañas'];
  const urgs = ['Estándar', 'Estándar', 'Estándar', 'Urgente', 'Crítico'];
  const dis = 'Jonathan Naranjo', start = Date.parse('2026-08-03T14:00:00Z');
  const fmt = ms => { const d = new Date(ms - 6 * H); return String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + d.getUTCFullYear(); };
  const out = [];
  for (let i = 1; i <= 72; i++) {
    const sol = pick(personas), t0 = start + Math.floor(rnd() * ((now - start) / DAY - 3)) * DAY + Math.floor(rnd() * 8) * H;
    const ev = [{ ts: t0, editor: sol, estado: 'Recibido', com: '' }]; let t = t0, com = '', est = 'Recibido';
    const push = (e, who, line) => { if (line) com += (com ? '\n' : '') + fmt(t) + ' ' + line; ev.push({ ts: t, editor: who, estado: e, com }); est = e; };
    t += (0.3 + rnd() * 6) * DAY; if (t > now) { out.push(mk(i, sol, t0, ev, est, com)); continue; }
    push('Programado', dis, pick(['Se programa en la cola', 'Se recibe, queda en cola de diseño']));
    if (rnd() < .2) { t += (1 + rnd() * 3) * DAY; if (t < now) push('Devuelto', dis, pick(['Falta confirmar claims y código de proveedor', 'Pendiente medidas del empaque'])); t += (1 + rnd() * 6) * DAY; if (t < now) push('En Proceso', dis, 'Se recibe información, inicia diseño'); }
    else { t += (1 + rnd() * 9) * DAY; if (t < now) push('En Proceso', dis, ''); }
    t += (1 + rnd() * 10) * DAY; if (t < now) { push('Entregado', dis, pick(['Se envía arte para revisión', 'Archivo actualizado en la carpeta Share Point'])); if (rnd() < .15) { t += 2 * DAY; if (t < now) push('En Proceso', dis, 'Ajustes solicitados'); t += 3 * DAY; if (t < now) push('Entregado', dis, 'Se comparte versión ajustada'); } t += (1 + rnd() * 12) * DAY; if (t < now && rnd() < .8) push('Finalizado', dis, 'APROBACION FINAL'); }
    out.push(mk(i, sol, t0, ev, est, com));
  }
  function mk(i, sol, t0, ev, est, com) {
    const req = t0 + (4 + Math.floor(rnd() * 12)) * DAY;
    return { id: i, sol: String(i), titulo: pick(['Arte caja ', 'Sticker ', 'Bolsa ', 'Funda ']) + pick(marcas) + ' ' + (100 + i), solicitante: sol, area: pick(areas), urg: pick(urgs), marca: pick(marcas), destino: pick(dests),
      tproc: pick(tprocs), tdis: pick(tdis), proveedor: pick(['CEMUSA', 'ESCALA IMPRESIONES', 'AC GRÁFICOS']), estado: est,
      fSol: rnd() < .7 ? Date.parse(new Date(t0).toISOString().slice(0, 10) + 'T07:00:00Z') : null, fReq: req, fEst: req + 2 * DAY, fEnt: null, versions: ev.map(e => ({ ...e })) };
  }
  return out;
};
