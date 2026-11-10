import { loadConfig, createLogger } from './config.js';
import { createDatabaseClient } from './db/client.js';
import { DatabaseAdapter } from './db/adapter.js';
import { SessionLifecycleManager } from './crawler/lifecycle.js';
import { CrawlOrchestrator } from './crawler/crawler.js';

async function main() {
  const config = loadConfig(process.env);
  const logger = createLogger([config.serviceRoleKey]);

  logger.info(`Starting Yorven Crawler Worker [${config.workerId}]...`);
  logger.info(`Target strictly constrained to: ${config.targetOrigin}`);

  const supabaseClient = createDatabaseClient(config.supabaseUrl, config.serviceRoleKey);
  const dbAdapter = new DatabaseAdapter(supabaseClient, config.workerId);
  const lifecycle = new SessionLifecycleManager(dbAdapter, { logger });
  const orchestrator = new CrawlOrchestrator(dbAdapter, lifecycle, { logger });

  // Handle graceful shutdown signals
  const onSignal = (sig) => {
    logger.info(`Received ${sig}. Initiating graceful worker shutdown...`);
    orchestrator.requestShutdown();
  };
  process.on('SIGINT', () => onSignal('SIGINT'));
  process.on('SIGTERM', () => onSignal('SIGTERM'));

  let sessionId = process.env.CRAWL_SESSION_ID || process.argv[2];

  if (!sessionId) {
    logger.info(`No active session specified. Creating new session for ${config.targetOrigin}...`);
    const sessionRes = await dbAdapter.startCrawlSession(config.targetOrigin);
    sessionId = sessionRes.session_id;
    logger.info(`Created new session '${sessionId}' (status: ${sessionRes.status})`);
  } else {
    logger.info(`Attaching to existing session '${sessionId}'...`);
  }

  await lifecycle.acquireOrRecover(sessionId);
  const result = await orchestrator.run();

  if (result) {
    logger.info(`Crawl session '${sessionId}' finished with status: ${result.final_status}`);
  } else {
    logger.info(`Worker terminated before session finalization.`);
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('src/index.js') || process.argv[1]?.endsWith('src\\index.js')) {
  main().catch((err) => {
    console.error('Fatal worker error:', err);
    process.exit(1);
  });
}
