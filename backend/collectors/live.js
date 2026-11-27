'use strict';
const { refreshMatchResult } = require('./results');
const { dayRange } = require('../services');
const { nowSec } = require('../lib/dates');

async function refreshLive({ provider, repos, date }) {
  const [from, to] = dayRange(date);
  const matches = repos.matchesBetween(from, to);
  const summary = { total: matches.length, refreshed: 0, inProgress: 0, errors: 0 };
  const now = nowSec();
  for (const m of matches) {
    if (['finished', 'canceled', 'postponed'].includes(m.status)) continue;
    if (m.status === 'notstarted' && Math.abs(m.start_time - now) > 7200) continue;
    try {
      await refreshMatchResult(m.id, { provider, repos });
      summary.refreshed += 1;
    } catch (err) {
      summary.errors += 1;
    }
  }
  const live = repos.matchesBetween(from, to).filter((m) => m.status === 'inprogress');
  summary.inProgress = live.length;
  return { summary, live };
}

module.exports = { refreshLive };
