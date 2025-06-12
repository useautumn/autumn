import dotenv from "dotenv";
dotenv.config();

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { authSchema, schemas as schema } from "@autumn/shared";

export let client = postgres(process.env.DATABASE_URL!);

export let db = drizzle(client, { schema });
export let authDb = drizzle(client, { schema: authSchema });

export const initDrizzle = () => {
  if (!client) {
    client = postgres(process.env.DATABASE_URL!);
  }

  if (!db) {
    db = drizzle(client, { schema });
  }
  // const client = postgres(process.env.DATABASE_URL!);

  // const db = drizzle(client, {
  //   schema: schemas,
  //   // logger: true, // Enable SQL logging for debugging
  // });

  return { db, client };
};

export type DrizzleCli = ReturnType<typeof initDrizzle>["db"];
