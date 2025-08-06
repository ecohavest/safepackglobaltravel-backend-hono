import "dotenv/config";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema.js";
if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
}
const connectionString = process.env.DATABASE_URL;
const sql = neon(connectionString);
export const db = drizzle({ client: sql, schema });
