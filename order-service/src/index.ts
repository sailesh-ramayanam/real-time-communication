import pg from 'pg';
import { createApp } from './app.js';
import { OrderRepository } from './orderRepository.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const port = Number(process.env.PORT ?? 3000);
const logRequests = process.env.LOG_REQUESTS !== 'false';

const pool = new pg.Pool({ connectionString: databaseUrl, max: 10 });
const app = createApp(new OrderRepository(pool), { logRequests });

const server = app.listen(port, () => {
  console.log(`order-service listening on :${port}`);
});

function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
