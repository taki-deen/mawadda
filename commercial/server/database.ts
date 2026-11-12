import { readdir, readFile } from 'node:fs/promises';
import { PrismaPg } from '@prisma/adapter-pg';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { PrismaClient } from './generated/client';

export async function connectDatabase(url?: string) {
  const local = url ? null : await PGlite.create();
  const socket = local ? new PGLiteSocketServer({ db: local, host: '127.0.0.1', port: 0, maxConnections: 1 }) : null;
  if (local && socket) {
    const migrations = new URL('../prisma/migrations/', import.meta.url);
    const directories = (await readdir(migrations, { withFileTypes: true })).filter(entry => entry.isDirectory());
    for (const name of directories.map(entry => entry.name).sort()) {
      await local.exec(await readFile(new URL(`${name}/migration.sql`, migrations), 'utf8'));
    }
    await socket.start();
  }
  const settings = socket ? { connectionString: `postgresql://postgres@${socket.getServerConn()}/postgres`, max: 1 } : { connectionString: url };
  const db = new PrismaClient({ adapter: new PrismaPg(settings), transactionOptions: { maxWait: 10000, timeout: 10000 } });
  return { db, async close() { await db.$disconnect(); await socket?.stop(); await local?.close(); } };
}
