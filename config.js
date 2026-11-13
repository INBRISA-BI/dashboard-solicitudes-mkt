// Único archivo que se edita. No contiene secretos: el Id de aplicación y el Id de directorio son identificadores públicos.
window.MKT_CONFIG = {
  CLIENT_ID: 'b56acac5-71f4-4b62-a25f-1ac437ed1e92',          // Registro "Dashboard Solicitudes MKT" en Entra
  TENANT_ID: '7842b47f-7df1-435d-9880-eda8e4177489',     // Directorio de Brinova/INBRISA
  SITE_HOST: 'inbrisa.sharepoint.com',
  SITE_PATH: '/sites/AppMKT',
  LIST_NAME: 'Solicitudes a MKT',
  DESIGNERS: ['Jonathan Naranjo'],                       // quienes cuentan como "diseñador" al medir respuesta
  TZ_OFFSET_H: -6,                                       // Costa Rica
  FERIADOS: ['2026-09-15', '2026-12-01', '2026-12-25', '2027-01-01'], // para el modo "días hábiles"; agregar los que falten
  REFRESH_MIN: 10,                                       // la página vuelve a leer SharePoint sola cada N minutos
  ALERTA_SIN_ACTUALIZAR_DIAS: 7                          // pendiente "sin actualizar" si pasa de N días
};
