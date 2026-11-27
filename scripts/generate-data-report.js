'use strict';
const { getDb } = require('../backend/database/db');
const db = getDb();
const counts = db.get(`SELECT (SELECT COUNT(*) FROM matches) AS matches, (SELECT COUNT(*) FROM matches WHERE status='finished') AS finished, (SELECT COUNT(*) FROM teams) AS teams, (SELECT COUNT(*) FROM forecasts) AS forecasts, (SELECT COUNT(*) FROM predictions WHERE outcome IS NOT NULL AND void=0) AS settled`);
// (sin consulta adicional)
const fs = require('node:fs');
const lines = [];
lines.push('# Datos obtenidos - HTML_FORECASTER');
lines.push('');
lines.push(`- Partidos: ${counts.matches} (${counts.finished} terminados)`);
lines.push(`- Equipos: ${counts.teams}`);
lines.push(`- Pronósticos: ${counts.forecasts}`);
lines.push(`- Predicciones liquidadas: ${counts.settled}`);
lines.push('');
lines.push('## Muestra de partidos');
const matches = db.all(`SELECT m.start_time, ht.name AS home, at.name AS away, m.home_goals, m.away_goals, m.status, m.tournament_name FROM matches m JOIN teams ht ON ht.id=m.home_team_id JOIN teams at ON at.id=m.away_team_id ORDER BY m.start_time LIMIT 20`);
for (const m of matches) {
  const score = m.home_goals !== null ? `${m.home_goals}-${m.away_goals}` : '-';
  lines.push(`- ${new Date(m.start_time*1000).toISOString().slice(0,16)} | ${m.home} vs ${m.away} | ${score} | ${m.status} | ${m.tournament_name}`);
}
lines.push('');
lines.push('## Calidad de pronósticos');
const fc = db.all(`SELECT quality_json FROM forecasts LIMIT 5`);
for (const f of fc) {
  const q = JSON.parse(f.quality_json);
  lines.push(`- Score ${q.score} (${q.grade}) | muestras ${q.samples.home}/${q.samples.away}`);
}
fs.writeFileSync('docs/DATOS-OBTENIDOS.md', lines.join('\n'));
console.log('Generado docs/DATOS-OBTENIDOS.md');