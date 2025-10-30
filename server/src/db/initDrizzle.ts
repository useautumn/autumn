import dotenv from "dotenv";

dotenv.config();

import { schemas as schema } from "@autumn/shared";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client, { schema });

export const initDrizzle = (params?: { maxConnections?: number }) => {
	const maxConnections = params?.maxConnections;
	const client = postgres(process.env.DATABASE_URL!, {
		max: maxConnections,
	});

	const db = drizzle(client, {
		schema,
	});

	return { db, client };
};

export type DrizzleCli = ReturnType<typeof initDrizzle>["db"];
