/* Acceso a datos: inicio de sesión Microsoft (MSAL) + Microsoft Graph, SOLO LECTURA.
   No copia ni modifica la lista: lee elementos y su historial de versiones con el permiso delegado Sites.Read.All. */
(function () {
  const C = window.MKT_CONFIG;
  const SCOPES = ['Sites.Read.All'];
  const G = 'https://graph.microsoft.com/v1.0';
  let app = null, account = null;

  async function init() {
    app = new msal.PublicClientApplication({
      auth: { clientId: C.CLIENT_ID, authority: 'https://login.microsoftonline.com/' + C.TENANT_ID, redirectUri: location.origin + location.pathname },
      cache: { cacheLocation: 'localStorage' },
    });
    if (app.initialize) await app.initialize();
    const r = await app.handleRedirectPromise();
    if (r && r.account) app.setActiveAccount(r.account);
    account = (r && r.account) || app.getActiveAccount() || app.getAllAccounts()[0] || null;
    if (account) app.setActiveAccount(account);
    return account;
  }
  const login = () => app.loginRedirect({ scopes: SCOPES });
  const logout = () => app.logoutRedirect({ account });
  async function token() {
    try { return (await app.acquireTokenSilent({ scopes: SCOPES, account })).accessToken; }
    catch (e) { await app.acquireTokenRedirect({ scopes: SCOPES }); throw new Error('Redirigiendo a Microsoft para renovar la sesión'); }
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function gfetch(url, opt = {}, tries = 4) {
    for (let i = 0; i < tries; i++) {
      const res = await fetch(url.startsWith('http') ? url : G + url, { ...opt, headers: { Authorization: 'Bearer ' + await token(), 'Content-Type': 'application/json', ...(opt.headers || {}) } });
      if (res.status === 429 || res.status === 503) { await sleep((+res.headers.get('Retry-After') || 2 ** i) * 1000); continue; }
      if (!res.ok) { let m = ''; try { m = (await res.json()).error.message; } catch (e) {} throw new Error('Graph ' + res.status + ': ' + m); }
      return res.json();
    }
    throw new Error('Graph: demasiados reintentos');
  }

  const T = s => s ? Date.parse(s) : null;
  const pk = (f, ...res) => { for (const re of res) { const k = Object.keys(f).find(k => re.test(k)); if (k && f[k] != null && f[k] !== '') return f[k]; } return null; };
  const num = x => x == null ? null : x;

  function normVersion(v) {
    const f = v.fields || {};
    return {
      ts: T(v.lastModifiedDateTime), editor: v.lastModifiedBy && v.lastModifiedBy.user ? v.lastModifiedBy.user.displayName : '',
      estado: pk(f, /^Estado$/), com: pk(f, /^Comentario.*dise/i) || '',
      fent: pk(f, /^FechaEntregada$/), fapr: pk(f, /^FechadeAprobaci/),
    };
  }
  function normItem(it, versions) {
    const f = it.fields || {};
    return {
      id: +it.id, sol: pk(f, /^IDSolicitud$/) || String(it.id), titulo: pk(f, /^Title$/) || '',
      solicitante: it.createdBy && it.createdBy.user ? it.createdBy.user.displayName : '',
      area: pk(f, /^(OData_)?_x00c1_rea$/, /^[AÁ]rea$/), urg: pk(f, /^NiveldeUrgencia$/), marca: pk(f, /^Marca$/), destino: pk(f, /^Destino$/),
      tproc: pk(f, /^Tipoproceso$/), tdis: pk(f, /^Tipodedise/), proveedor: pk(f, /^Proveedor$/), estado: pk(f, /^Estado$/),
      fSol: T(pk(f, /^FechadeSolicitud$/)), fReq: T(pk(f, /^FechaRequerida$/)), fEst: T(pk(f, /^FechaEntregaEstimada$/)), fEnt: T(pk(f, /^FechaEntregada$/)),
      created: T(it.createdDateTime), modified: it.lastModifiedDateTime, versions,
    };
  }

  const ck = id => 'mktdash:v1:' + id;
  function cacheGet(id, mod) { try { const x = JSON.parse(localStorage.getItem(ck(id))); return x && x.mod === mod ? x.v : null; } catch (e) { return null; } }
  function cachePut(id, mod, v) { try { localStorage.setItem(ck(id), JSON.stringify({ mod, v })); } catch (e) {} }

  async function fetchAll(progress) {
    progress && progress('Buscando el sitio…');
    const site = await gfetch(`/sites/${C.SITE_HOST}:${C.SITE_PATH}`);
    const lists = await gfetch(`/sites/${site.id}/lists?$filter=displayName eq '${C.LIST_NAME.replace(/'/g, "''")}'&$select=id,displayName`);
    if (!lists.value.length) throw new Error('No se encontró la lista "' + C.LIST_NAME + '"');
    const lid = lists.value[0].id;
    progress && progress('Leyendo solicitudes…');
    let items = [], url = `/sites/${site.id}/lists/${lid}/items?$expand=fields&$top=200`;
    while (url) { const r = await gfetch(url); items = items.concat(r.value); url = r['@odata.nextLink'] || null; }
    // historial de versiones solo para lo que cambió desde la última lectura
    const need = [], vmap = {};
    items.forEach(it => { const c = cacheGet(it.id, it.lastModifiedDateTime); if (c) vmap[it.id] = c; else need.push(it); });
    for (let i = 0; i < need.length; i += 20) {
      const chunk = need.slice(i, i + 20);
      progress && progress(`Leyendo historial (${Math.min(i + 20, need.length)}/${need.length})…`);
      const r = await gfetch('/$batch', { method: 'POST', body: JSON.stringify({ requests: chunk.map(it => ({ id: String(it.id), method: 'GET', url: `/sites/${site.id}/lists/${lid}/items/${it.id}/versions` })) }) });
      for (const resp of r.responses) {
        const it = chunk.find(x => String(x.id) === resp.id);
        if (resp.status !== 200) throw new Error('Versiones ' + resp.id + ': HTTP ' + resp.status);
        const v = resp.body.value.map(normVersion); vmap[it.id] = v; cachePut(it.id, it.lastModifiedDateTime, v);
      }
    }
    return items.map(it => normItem(it, vmap[it.id] || []));
  }

  window.MKTData = { init, login, logout, fetchAll, account: () => account };
})();
