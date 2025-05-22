import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import {
  customers,
  chatResults,
  organizations,
  apiKeys,
  rewards,
} from "./schema/index.js";
import * as relations from "./relations.js";

const client = postgres(process.env.DATABASE_URL!);

export const initDrizzle = () => {
  const db = drizzle(client, {
    schema: {
      customers,
      chatResults,
      organizations,
      apiKeys,
      rewards,
      ...relations,
    },
  });
  return db;
};

export type DrizzleCli = ReturnType<typeof initDrizzle>;
