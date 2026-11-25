/*
 * Recolector para ejecutar DENTRO de www.sofascore.com (marcador/bookmarklet o consola).
 * Sofascore rechaza (HTTP 403) las peticiones que no salen de su propia web; ejecutado allí,
 * el navegador las hace igual que la propia página. Descarga exactamente las mismas rutas
 * que pide backend/providers/sofascore/client.js y genera un .json que HTML_Forecaster importa.
 * __CFG__ lo sustituye la página «Datos y ajustes» con la configuración actual.
 */
(async () => {
  const CFG = __CFG__;
  if (window.__hfRunning) { alert('HTML_Forecaster: la descarga ya está en marcha.'); return; }
  if (!/sofascore\.com$/.test(location.hostname)) { alert('Abre primero https://www.sofascore.com y ejecuta allí el marcador.'); return; }
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const shift = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const date = prompt('HTML_Forecaster · ¿Fecha a analizar? (AAAA-MM-DD)', ymd(new Date()));
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  window.__hfRunning = true;

  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;z-index:2147483647;right:16px;bottom:16px;width:340px;background:#121826;color:#e5e7eb;font:13px system-ui,sans-serif;padding:14px 16px;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.4)';
  document.body.appendChild(box);
  const say = (t) => { box.innerHTML = `<b style="color:#60a5fa">HTML_FORECASTER</b><br>${t}`; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = {};
  let base = '/api/v1';
  let n = 0;

  async function get(path) {
    if (path in out) return out[path];
    for (let attempt = 0; attempt < 3; attempt++) {
      await sleep(CFG.intervalMs);
      const res = await fetch(base + path, { headers: { Accept: 'application/json' } });
      n++;
      if (res.status === 404) { out[path] = null; return null; }
      if (res.ok) { out[path] = await res.json(); return out[path]; }
      if (res.status !== 429 && res.status < 500) throw new Error(`HTTP ${res.status} en ${path}`);
      await sleep(2000 * (attempt + 1));
    }
    throw new Error(`Sin respuesta en ${path}`);
  }

  const localDate = (ts) => ymd(new Date(ts * 1000));
  const allowed = (e) => !CFG.tournaments.length || CFG.tournaments.includes(e.tournament?.uniqueTournament?.id);
  const finished = (e) => e.status?.type === 'finished' && (Number.isFinite(e.homeScore?.normaltime) || Number.isFinite(e.homeScore?.current));

  try {
    say('Comprobando acceso…');
    // Se prueban varias direcciones de la API; se usa la primera que devuelva partidos de verdad
    const probePath = `/sport/football/scheduled-events/${date}`;
    const candidates = ['https://api.sofascore.com/api/v1', '/api/v1', 'https://www.sofascore.com/api/v1'];
    const report = [];
    let found = false;
    for (const c of candidates) {
      try {
        const res = await fetch(c + probePath, { headers: { Accept: 'application/json' } });
        n++;
        const text = await res.text();
        let j = null;
        try { j = JSON.parse(text); } catch { /* no es JSON */ }
        if (res.ok && Array.isArray(j?.events)) { base = c; out[probePath] = j; found = true; break; }
        report.push(`${c}: HTTP ${res.status} ${text.slice(0, 80).replace(/</g, '&lt;')}`);
      } catch (e) {
        report.push(`${c}: ${e.message}`);
      }
      await sleep(CFG.intervalMs);
    }
    if (!found) throw new Error(`Ninguna dirección de la API respondió con partidos.<br><small>${report.join('<br>')}</small>`);
    // 1) Partidos del día (+ vecinos por zona horaria), igual que el proveedor
    const scheduled = new Map();
    for (const d of [shift(date, -1), date, shift(date, 1)]) {
      for (const e of (await get(`/sport/football/scheduled-events/${d}`))?.events ?? []) scheduled.set(e.id, e);
    }
    const ofDay = [...scheduled.values()].filter((e) => localDate(e.startTimestamp) === date);
    let matches = ofDay.filter(allowed).sort((a, b) => a.startTimestamp - b.startTimestamp);
    if (!matches.length && ofDay.length) {
      // Ningún partido en los torneos configurados: ofrecer los torneos que sí juegan ese día
      const counts = new Map();
      for (const e of ofDay) {
        const ut = e.tournament?.uniqueTournament;
        if (!ut) continue;
        const k = ut.id;
        const c = counts.get(k) || { id: k, name: `${ut.name}${e.tournament?.category?.name ? ' (' + e.tournament.category.name + ')' : ''}`, n: 0, users: ut.userCount || 0 };
        c.n++; counts.set(k, c);
      }
      const list = [...counts.values()].sort((a, b) => b.users - a.users || b.n - a.n).slice(0, 25);
      const answer = prompt(`Ninguno de tus torneos (${CFG.tournaments.join(', ') || 'todos'}) juega el ${date}.\nTorneos con partidos ese día (ID · nombre · partidos):\n`
        + list.map((t) => `${t.id} · ${t.name} · ${t.n}`).join('\n')
        + '\n\nEscribe los IDs a analizar, separados por coma:', list.slice(0, 3).map((t) => t.id).join(','));
      const ids = (answer || '').split(',').map((x) => parseInt(x.trim(), 10)).filter(Number.isFinite);
      if (ids.length) {
        CFG.tournaments = ids;
        matches = ofDay.filter(allowed).sort((a, b) => a.startTimestamp - b.startTimestamp);
      }
    }
    if (CFG.maxMatches > 0) matches = matches.slice(0, CFG.maxMatches);
    if (!matches.length) say(`No hay partidos de los torneos elegidos el ${date}. Se descargarán solo resultados recientes.`);

    // 2) Histórico de cada equipo + estadísticas
    const teams = [...new Set(matches.flatMap((e) => [e.homeTeam.id, e.awayTeam.id]))];
    let i = 0;
    for (const id of teams) {
      say(`Equipos ${++i}/${teams.length} · ${n} peticiones`);
      try {
        const events = [];
        for (let page = 0; page < 5 && events.length < CFG.historyDepth + 5; page++) {
          const j = await get(`/team/${id}/events/last/${page}`);
          if (!j?.events?.length) break;
          events.push(...j.events);
          if (!j.hasNextPage) break;
        }
        const fin = events.filter(finished).sort((a, b) => b.startTimestamp - a.startTimestamp).slice(0, CFG.historyDepth);
        for (const e of fin.slice(0, CFG.statsDepth)) await get(`/event/${e.id}/statistics`).catch(() => {});
      } catch (err) { console.warn('HTML_Forecaster equipo', id, err); }
    }

    // 3) H2H, clasificación y cuotas por partido
    const seen = new Set();
    i = 0;
    for (const e of matches) {
      say(`Partidos ${++i}/${matches.length} · ${n} peticiones`);
      try {
        if (e.customId) {
          const h = await get(`/event/${e.customId}/h2h/events`);
          const fin = (h?.events ?? []).filter((x) => x.id !== e.id && finished(x)).sort((a, b) => b.startTimestamp - a.startTimestamp);
          for (const x of fin.slice(0, CFG.h2hStatsDepth)) await get(`/event/${x.id}/statistics`).catch(() => {});
        }
        const ut = e.tournament?.uniqueTournament?.id;
        if (ut && e.season?.id && !seen.has(`${ut}|${e.season.id}`)) {
          seen.add(`${ut}|${e.season.id}`);
          await get(`/unique-tournament/${ut}/season/${e.season.id}/standings/total`).catch(() => {});
        }
        await get(`/event/${e.id}/odds/1/all`).catch(() => {});
      } catch (err) { console.warn('HTML_Forecaster partido', e.id, err); }
    }

    // 4) Resultados recientes para liquidar pronósticos anteriores
    const pending = new Set(CFG.pendingIds);
    const recent = new Map();
    for (let k = CFG.resultDays; k >= 1; k--) {
      say(`Resultados recientes: día −${k} · ${n} peticiones`);
      for (const e of (await get(`/sport/football/scheduled-events/${shift(date, -k)}`))?.events ?? []) recent.set(e.id, e);
    }
    const toSettle = [...recent.values()].filter((e) => finished(e) && (pending.has(e.id) || (CFG.tournaments.length && allowed(e))));
    i = 0;
    for (const e of toSettle) {
      say(`Resultados ${++i}/${toSettle.length} · ${n} peticiones`);
      await get(`/event/${e.id}/statistics`).catch(() => {});
      await get(`/event/${e.id}/incidents`).catch(() => {});
    }

    const file = { format: 'hf-sofascore-cache', version: 1, date, tournaments: CFG.tournaments, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, createdAt: new Date().toISOString(), requests: n, responses: out };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: 'application/json' }));
    a.download = `sofascore_${date}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    say(`Listo: ${matches.length} partidos, ${n} peticiones.<br>Se descargó <b>sofascore_${date}.json</b>. Impórtalo en HTML_Forecaster.`);
  } catch (err) {
    say(`<span style="color:#f87171">Error: ${err.message}</span><br>Copia este texto (o haz una captura) y envíaselo a quien te ayuda con HTML_Forecaster.`); console.warn('HTML_Forecaster', err);
  } finally {
    window.__hfRunning = false;
    setTimeout(() => box.remove(), 120000);
  }
})();
