#!/usr/bin/env node
// Daily metrics refresh script
// Run via Heroku Scheduler: node scripts/refresh-metrics.js

const metricsStore = require('../financial-analyst/metrics-store');

async function main() {
  console.log('Starting metrics refresh at', new Date().toISOString());

  try {
    await metricsStore.refreshAllMetrics();
    console.log('Metrics refresh completed successfully');
    process.exit(0);
  } catch (err) {
    console.error('Metrics refresh failed:', err);
    process.exit(1);
  }
}

main();
