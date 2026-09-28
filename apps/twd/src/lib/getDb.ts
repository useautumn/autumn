import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../db/schema/schema.ts";
import { getTwdEnv } from "./env.ts";

const createDb = () =>
	drizzle(postgres(getTwdEnv().TWD_DATABASE_URL, { max: 20 }), { schema });

export type TwdDb = ReturnType<typeof createDb>;

let db: TwdDb | undefined;
export const getDb = (): TwdDb => {
	db ??= createDb();
	return db;
};
