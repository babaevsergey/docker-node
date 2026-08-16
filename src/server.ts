import Fastify from 'fastify';
import pg from 'pg';
import { hostname } from 'node:os';

const app = Fastify({ logger: false });
const pool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL })
  : null;

app.get('/health', async () => ({ status: 'ok' }));

app.get('/users', async () => [
  {
    id: 1,
    name: 'Ada',
  },
]);

app.get('/', async () => ({
  service: 'l5-docker',
  hostname: process.env.HOSTNAME ?? hostname(),
  user: process.getuid?.() === 0 ? 'root ⚠️' : `uid=${process.getuid?.()}`,
  node: process.version,
  db: pool ? 'налаштована' : 'не налаштована',
}));

app.get('/db', async (req, reply) => {
  if (!pool) return reply.code(503).send({ error: 'DATABASE_URL не задано' });
  const { rows } = await pool.query('select now() as time, current_user as who');
  return rows[0];
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, async () => {
    console.log(`\n[${sig}] закриваюсь коректно…`);
    await app.close();
    await pool?.end();
    process.exit(0);
  });
}

await app.listen({ port: 3000, host: '0.0.0.0' });
console.log(
  `слухаю :3000  ·  hostname=${process.env.HOSTNAME ?? hostname()}  ·  uid=${process.getuid?.()}`,
);
