/* Utilidades compartidas del frontend: API, tema, navegación y formato. */
(function () {
  const root = document.documentElement;
  const stored = (() => { try { return localStorage.getItem('hf-theme'); } catch { return null; } })();
  if (stored ? stored === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches) root.classList.add('dark');
})();

const HF = {
  async api(path, opts = {}) {
    const res = await fetch(`/api${path}`, { headers: { 'Content-Type': 'application/json' }, ...opts });
    const body = await res.json().catch(() => ({}));
    if (!res.ok && res.status !== 202 && res.status !== 409) throw new Error(body.error || `HTTP ${res.status}`);
    return body;
  },
  esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); },
  pct(p, d = 0) { return p === null || p === undefined || Number.isNaN(p) ? '—' : `${(p * 100).toFixed(d)}%`; },
  n(x, d = 2) { return x === null || x === undefined || Number.isNaN(x) ? '—' : Number(x).toFixed(d); },
  time(unix) { return new Date(unix * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); },
  dateTime(unix) { return new Date(unix * 1000).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }); },
  today() { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); },
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
  param(name) { return new URLSearchParams(location.search).get(name); },
  chartColors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (k) => cs.getPropertyValue(k).trim();
    return { text: v('--text'), muted: v('--muted'), border: v('--border'), accent: v('--accent'), home: v('--home'), draw: v('--draw'), away: v('--away'), good: v('--good'), bad: v('--bad') };
  },
  header(active) {
    const links = [['index', 'Partidos del día'], ['stats', 'Rendimiento'], ['history', 'Historial']];
    const el = document.createElement('header');
    el.className = 'topbar';
    el.innerHTML = `<div class="max-w-7xl mx-auto px-4 py-2.5 flex items-center gap-4 flex-wrap">
      <a href="/" class="brand text-lg" style="color:var(--text)">HTML<span>_FORECASTER</span></a>
      <nav class="nav flex gap-1 overflow-x-auto">${links.map(([h, l]) => `<a href="/${h === 'index' ? '' : h}" class="${active === h ? 'active' : ''}">${l}</a>`).join('')}</nav>
      <div class="ml-auto flex items-center gap-3">
        <span id="hf-health" class="text-xs muted hidden sm:inline"></span>
        <button id="hf-theme" class="btn btn-ghost" title="Cambiar tema claro/oscuro" aria-label="Cambiar tema"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:block"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/></svg></button>
      </div></div>`;
    document.body.prepend(el);
    el.querySelector('#hf-theme').onclick = () => {
      const dark = document.documentElement.classList.toggle('dark');
      try { localStorage.setItem('hf-theme', dark ? 'dark' : 'light'); } catch { /* sin almacenamiento */ }
      document.dispatchEvent(new CustomEvent('hf-theme'));
    };
    HF.api('/health').then((h) => {
      document.getElementById('hf-health').textContent = `v${h.version} · ${h.provider} · ${h.counts.matches} partidos · ${h.counts.stats} con estadísticas`;
    }).catch(() => { document.getElementById('hf-health').textContent = 'API no disponible'; });
  },
};
window.HF = HF;
