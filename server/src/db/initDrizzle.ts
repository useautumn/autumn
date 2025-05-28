import dotenv from "dotenv";
dotenv.config();

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { schemas } from "@autumn/shared";

export const initDrizzle = () => {
  const client = postgres(process.env.DATABASE_URL!);

  const db = drizzle(client, {
    schema: schemas,
    // logger: true, // Enable SQL logging for debugging
  });

  return { db, client };
};

export type DrizzleCli = ReturnType<typeof initDrizzle>["db"];
