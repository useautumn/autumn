import * as schema from "@autumn/shared/db/schema";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "./env.js";

const client = postgres(env.DATABASE_URL, { max: 4 });

export const db = drizzle(client, { schema });
export type ChatDb = typeof db;
