# Dashboard · Solicitudes a Marketing (GitHub Pages)

Página estática. En GitHub solo está el código: **no hay datos ni copias de la lista**. Al abrirla, cada persona inicia sesión con su cuenta de Brinova y la página lee en vivo la lista *Solicitudes a MKT* (solo lectura, sin bloquear ni modificar nada) y su historial de versiones. Se vuelve a leer sola cada 10 minutos.

Archivos: `index.html`, `app.js` (interfaz), `analytics.js` (cálculos), `data.js` (inicio de sesión y lectura), `demo.js` (datos inventados para pruebas), `config.js` (único archivo que se edita).

Vista previa sin iniciar sesión: abrir la página con `?demo=1` (datos inventados).

## 1. Aplicación en Microsoft Entra (ya registrada)
Registro **Dashboard Solicitudes MKT** en el directorio de Brinova (solo esta organización), tipo SPA, URI de redirección `https://inbrisa-bi.github.io/dashboard-solicitudes-mkt/`, permiso delegado de Microsoft Graph `Sites.Read.All` (no exige consentimiento de administrador; cada persona lo acepta la primera vez que entra, o TI puede usar "Conceder consentimiento de administrador"). El Id de aplicación ya está en `config.js`.
Si el repositorio se llama distinto, agregar esa URL en Autenticación → URI de redirección de la aplicación.
Opción más restrictiva: cambiar a `Sites.Selected` y conceder lectura solo al sitio *App MKT*.

## 2. Publicar
1. Crear el repositorio `dashboard-solicitudes-mkt` en la organización INBRISA-BI y subir estos archivos a la raíz.
2. Settings → Pages → Deploy from a branch → `main` / `/ (root)`.
3. Abrir `https://inbrisa-bi.github.io/dashboard-solicitudes-mkt/`.

## 3. Ajustes en `config.js`
- `DESIGNERS`: nombres (como aparecen en SharePoint) de quienes cuentan como diseñador.
- `FERIADOS`: fechas `AAAA-MM-DD` para el botón *Días hábiles*.
- `REFRESH_MIN`, `ALERTA_SIN_ACTUALIZAR_DIAS`.

## Notas
- Solo ven datos quienes ya tienen acceso al sitio *App MKT*; el permiso es delegado (el de cada persona).
- El solicitante se toma de "Creado por"; si alguien crea solicitudes a nombre de otra persona, se atribuyen a quien las creó.
- La primera carga lee el historial de cada solicitud; las siguientes solo las que cambiaron (caché en el navegador de cada usuario).
