import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import { db, pool } from "./client";

await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
console.log("Database migrations applied.");
await pool.end();
