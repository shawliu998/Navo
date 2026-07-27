import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL ?? "postgresql://navo:navo@localhost:55432/navo";
const globalForDb = globalThis as unknown as { navoPool?: pg.Pool };
export const pool = globalForDb.navoPool ?? new pg.Pool({ connectionString, max: 10 });
if (process.env.NODE_ENV !== "production") globalForDb.navoPool = pool;
export const db = drizzle(pool, { schema });
