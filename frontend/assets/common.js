/* Utilidades compartidas del frontend: API, tema, navegación y formato. */
(function () {
  const root = document.documentElement;
  const stored = (() => { try { return localStorage.getItem('hf-theme'); } catch { return null; } })();
  if (stored ? stored === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches) root.classList.add('dark');
})();

const HF = {
  pages: {},
  /** En la versión de archivo único, HF.transport ejecuta la API dentro del navegador. */
  transport: null,
  async api(path, opts = {}) {
    let status, body;
    if (HF.transport) {
      ({ status, body } = await HF.transport(opts.method || 'GET', path, opts.body ? JSON.parse(opts.body) : null));
    } else {
      const res = await fetch(`/api${path}`, { headers: { 'Content-Type': 'application/json' }, ...opts });
      status = res.status;
      body = await res.json().catch(() => ({}));
    }
    if ((status < 200 || status >= 300) && status !== 409) throw new Error(body.error || `HTTP ${status}`);
    return body;
  },
  /** Enlace a una página: rutas reales en el servidor, #/ruta en el archivo único. */
  link(page, params = {}) {
    const qs = new URLSearchParams(params).toString();
    if (HF.transport) return `#/${page === 'index' ? '' : page}${qs ? '?' + qs : ''}`;
    return `/${page === 'index' ? '' : page}${qs ? '?' + qs : ''}`;
  },
  query() {
    if (HF.transport) { const h = location.hash.replace(/^#\/?/, ''); return new URLSearchParams(h.includes('?') ? h.slice(h.indexOf('?') + 1) : ''); }
    return new URLSearchParams(location.search);
  },
  setQuery(params) {
    const qs = new URLSearchParams(params).toString();
    if (HF.transport) { const page = (location.hash.replace(/^#\/?/, '').split('?')[0]); history.replaceState(null, '', `#/${page}${qs ? '?' + qs : ''}`); }
    else history.replaceState(null, '', `?${qs}`);
  },
  /** Monta una página en #root; limpia gráficos anteriores. */
  mount(page) {
    HF.onTheme = null;
    if (HF.onLeave) { try { HF.onLeave(); } catch { /* nada */ } HF.onLeave = null; }
    HF.charts.forEach((c) => c.destroy());
    HF.charts = [];
    document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.page === page));
    const root = document.getElementById('root');
    root.innerHTML = '<div class="empty">Cargando…</div>';
    window.scrollTo(0, 0);
    (HF.pages[page] || HF.pages.index)(root);
  },
  charts: [],
  onTheme: null,
  onLeave: null,
  health: null,
  /** Tabla ligera con búsqueda, orden por columna y paginación (sustituye a DataTables). */
  table(el, { columns, rows, pageSize = 25, empty = 'Sin registros', sortCol = 0, sortDir = -1 }) {
    const st = { q: '', page: 0, sortCol, sortDir };
    const draw = () => {
      const q = st.q.toLowerCase();
      let r = rows.filter((row) => !q || row.text.toLowerCase().includes(q));
      r = r.slice().sort((a, b) => { const x = a.sort[st.sortCol], y = b.sort[st.sortCol]; return (x > y ? 1 : x < y ? -1 : 0) * st.sortDir; });
      const pages = Math.max(1, Math.ceil(r.length / pageSize));
      st.page = Math.min(st.page, pages - 1);
      const slice = r.slice(st.page * pageSize, (st.page + 1) * pageSize);
      el.innerHTML = `<div class="flex items-center justify-between gap-2 mb-2 flex-wrap"><input class="hft-q" placeholder="Buscar…" value="${HF.esc(st.q)}"><span class="text-xs muted">${r.length} registros</span></div>
        <div class="scroll-x"><table class="t"><thead><tr>${columns.map((c, i) => `<th data-i="${i}" style="cursor:pointer">${c}${st.sortCol === i ? (st.sortDir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
        <tbody>${slice.length ? slice.map((row) => `<tr>${row.cells.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${columns.length}" class="empty">${empty}</td></tr>`}</tbody></table></div>
        ${pages > 1 ? `<div class="flex items-center justify-end gap-2 mt-2 text-sm"><button class="btn btn-ghost hft-prev" ${st.page === 0 ? 'disabled' : ''}>‹</button><span class="muted">${st.page + 1} / ${pages}</span><button class="btn btn-ghost hft-next" ${st.page >= pages - 1 ? 'disabled' : ''}>›</button></div>` : ''}`;
      const qi = el.querySelector('.hft-q');
      qi.oninput = () => { st.q = qi.value; st.page = 0; draw(); const n = el.querySelector('.hft-q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); };
      el.querySelectorAll('th').forEach((th) => { th.onclick = () => { const i = Number(th.dataset.i); st.sortDir = st.sortCol === i ? -st.sortDir : -1; st.sortCol = i; draw(); }; });
      el.querySelector('.hft-prev')?.addEventListener('click', () => { st.page--; draw(); });
      el.querySelector('.hft-next')?.addEventListener('click', () => { st.page++; draw(); });
    };
    draw();
  },
  esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); },
  pct(p, d = 0) { return p === null || p === undefined || Number.isNaN(p) ? '—' : `${(p * 100).toFixed(d)}%`; },
  n(x, d = 2) { return x === null || x === undefined || Number.isNaN(x) ? '—' : Number(x).toFixed(d); },
  time(unix) { return new Date(unix * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); },
  dateTime(unix) { return new Date(unix * 1000).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }); },
  /** Zona horaria de la configuración (llega con /health); si no, la del navegador. */
  tz: null,
  today() {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: HF.tz || undefined, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); } catch { /* zona inválida */ }
    const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  },
  /** Descarga un texto como archivo (CSV), en servidor y en el archivo único. */
  download(filename, text, type = 'text/csv;charset=utf-8') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + text], { type }));
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
  /**
   * WhatsApp Web: abre el chat del número de destino con el texto ya escrito en la cuenta que tengas
   * abierta en web.whatsapp.com (tú pulsas Enter). Reutiliza la misma pestaña en cada envío.
   * El número se guarda solo en este navegador.
   */
  whatsapp: {
    key: 'hf-wa-to',
    getTo() { try { return localStorage.getItem(this.key) || HF.health?.whatsappWebTo || ''; } catch { return HF.health?.whatsappWebTo || ''; } },
    setTo(n) { try { localStorage.setItem(this.key, n); } catch { /* sin almacenamiento */ } },
    askTo(force = false) {
      let to = this.getTo();
      if (!to || force) {
        const v = prompt('Número de WhatsApp de destino con código de país (solo números, ej. 573001234567):', to || '');
        if (v === null) return null;
        to = v.replace(/\D/g, '');
        if (to.length < 8) { alert('Número no válido.'); return null; }
        this.setTo(to);
      }
      return to;
    },
    open(text, { force = false } = {}) {
      const to = this.askTo(force);
      if (!to) return false;
      window.open(`https://web.whatsapp.com/send?phone=${to}&text=${encodeURIComponent(text)}`, 'hf-whatsapp');
      return true;
    },
  },
  async exportCsv(type) { const r = await HF.api(`/export?type=${type}`); HF.download(r.filename, r.csv); },
  /** Score de confianza 0–100 con nivel A+…D. */
  cBadge(grade, score) { return grade ? `<span class="badge q-${grade === 'A+' ? 'Ap' : grade}" title="Score de confianza ${score ?? ''}/100">${grade}${score !== undefined ? ' · ' + score : ''}</span>` : '—'; },
  qBadge(grade, score) { return grade ? `<span class="badge q-${grade}" title="Calidad del dato ${score ?? ''}/100">${grade}${score !== undefined ? ' · ' + score : ''}</span>` : '—'; },
  bar3(p) {
    if (!p) return '<span class="muted">—</span>';
    return `<div class="bar3" title="1 ${HF.pct(p[1])} · X ${HF.pct(p.X)} · 2 ${HF.pct(p[2])}"><div style="width:${p[1] * 100}%"></div><div style="width:${p.X * 100}%"></div><div style="width:${p[2] * 100}%"></div></div>`;
  },
  pbar(p) { return `<div class="pbar"><div style="width:${Math.max(0, Math.min(1, p || 0)) * 100}%"></div></div>`; },
  outcome(o, isVoid) { return isVoid ? '<span class="muted">anulada</span>' : o === 1 ? '<span class="ok">✔ acierto</span>' : o === 0 ? '<span class="ko">✘ fallo</span>' : '<span class="muted">pendiente</span>'; },
  alpha(hex, a) {
    const h = hex.replace('#', '');
    if (h.length !== 6) return hex;
    return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${a})`;
  },
  param(name) { return HF.query().get(name); },
  chartColors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (k) => cs.getPropertyValue(k).trim();
    return { text: v('--text'), muted: v('--muted'), border: v('--border'), accent: v('--accent'), home: v('--home'), draw: v('--draw'), away: v('--away'), good: v('--good'), bad: v('--bad') };
  },
  header() {
    const links = [['index', 'Partidos del día'], ...(HF.transport ? [] : [['live', 'En vivo']]), ['value', 'Valor'], ['stats', 'Calibración y backtesting'], ['history', 'Historial']];
    const el = document.createElement('header');
    el.className = 'topbar';
    el.innerHTML = `<div class="max-w-7xl mx-auto px-4 py-2.5 flex items-center gap-4 flex-wrap">
      <a href="${HF.link('index')}" class="brand text-lg" style="color:var(--text)">HTML<span>_FORECASTER</span></a>
      <nav class="nav flex gap-1 overflow-x-auto">${links.map(([h, l]) => `<a href="${HF.link(h)}" data-page="${h}">${l}</a>`).join('')}</nav>
      <div class="ml-auto flex items-center gap-3">
        <span id="hf-health" class="text-xs muted hidden sm:inline"></span>
        <span id="hf-tools"></span>
        <button id="hf-theme" class="btn btn-ghost" title="Cambiar tema claro/oscuro" aria-label="Cambiar tema"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:block"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/></svg></button>
      </div></div>`;
    document.body.prepend(el);
    el.querySelector('#hf-theme').onclick = () => {
      const dark = document.documentElement.classList.toggle('dark');
      try { localStorage.setItem('hf-theme', dark ? 'dark' : 'light'); } catch { /* sin almacenamiento */ }
      if (HF.onTheme) HF.onTheme();
    };
    HF.refreshHealth();
  },
  refreshHealth() {
    HF.api('/health').then((h) => {
      HF.health = h;
      if (h.timezone) HF.tz = h.timezone;
      document.getElementById('hf-health').textContent = `v${h.version} · ${h.provider}${h.fallbackProvider ? ' → ' + h.fallbackProvider : ''} · ${h.counts.matches} partidos · ${h.counts.stats} con estadísticas`;
    }).catch(() => { document.getElementById('hf-health').textContent = 'API no disponible'; });
  },
};
window.HF = HF;
