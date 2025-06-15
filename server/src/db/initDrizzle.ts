import dotenv from "dotenv";
dotenv.config();

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { schemas } from "@autumn/shared";

export const initDrizzle = (params?: { maxConnections?: number }) => {
  let maxConnections = params?.maxConnections || 4;
  const client = postgres(process.env.DATABASE_URL!, {
    max: maxConnections,
  });

  const db = drizzle(client, {
    schema: schemas,
    // logger: true, // Enable SQL logging for debugging
  });

  return { db, client };
};

export type DrizzleCli = ReturnType<typeof initDrizzle>["db"];
