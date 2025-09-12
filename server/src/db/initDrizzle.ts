import dotenv from "dotenv";
dotenv.config();

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { schemas as schema } from "@autumn/shared";

const DATABASE_URL = process.env.DATABASE_URL!;

// Require SSL when connecting to Supabase (pooler enforces TLS)
// Keep non-SSL for local hosts
let postgresOptions: any = {};
try {
  const { hostname } = new URL(DATABASE_URL);
  const isLocalHost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "host.docker.internal";
  const isSupabase = hostname.includes("supabase.com");
  if (isSupabase && !isLocalHost) {
    postgresOptions.ssl = "require";
  }
} catch {}

export let client = postgres(DATABASE_URL, postgresOptions);
export let db = drizzle(client, { schema });

export const initDrizzle = (params?: { maxConnections?: number }) => {
  let maxConnections = params?.maxConnections || 10;
  const client = postgres(DATABASE_URL, {
    max: maxConnections,
    ...postgresOptions,
  });

  const db = drizzle(client, {
    schema,
  });

  return { db, client };
};

export type DrizzleCli = ReturnType<typeof initDrizzle>["db"];
