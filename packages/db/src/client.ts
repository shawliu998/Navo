import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL ?? "postgresql://exportplay:exportplay@localhost:54322/exportplay";
const globalForDb = globalThis as unknown as { exportplayPool?: pg.Pool };
export const pool = globalForDb.exportplayPool ?? new pg.Pool({ connectionString, max: 10 });
if (process.env.NODE_ENV !== "production") globalForDb.exportplayPool = pool;
export const db = drizzle(pool, { schema });
