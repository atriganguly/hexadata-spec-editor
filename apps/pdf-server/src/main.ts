import { buildApp } from './app.ts';
import { ConfigError, loadConfig } from './config.ts';

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(`Configuration error: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }

  const { app, pool } = await buildApp(config);

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'Shutting down: draining requests');
    const force = setTimeout(() => {
      app.log.error('Forced shutdown after timeout');
      process.exit(1);
    }, 25_000);
    force.unref();
    try {
      await app.close(); // stops accepting, waits for in-flight renders, then closes the browser
      process.exit(0);
    } catch (error) {
      app.log.error({ err: error }, 'Error during shutdown');
      process.exit(1);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ host: config.host, port: config.port });
  if (config.warmOnBoot) void pool.warm();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
