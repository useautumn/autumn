import dotenv from "dotenv";

dotenv.config();

import { schemas as schema } from "@autumn/shared";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client, { schema });

export const initDrizzle = (params?: {
	maxConnections?: number;
	replica?: boolean;
}) => {
	const maxConnections = params?.maxConnections || 10;
	const dbUrl =
		(params?.replica
			? process.env.DATABASE_REPLICA_URL
			: process.env.DATABASE_URL) ?? "";
	const client = postgres(dbUrl, {
		max: maxConnections,
	});

	const db = drizzle(client, {
		schema,
	});

	return { db, client };
};

export type DrizzleCli = ReturnType<typeof initDrizzle>["db"];

export const initAnalyticsDb = (params?: { maxConnections?: number }) => {
	const maxConnections = params?.maxConnections || 10;
	const dbUrl = process.env.ANALYTICS_DATABASE_URL ?? "";

	if (!dbUrl) {
		throw new Error("ANALYTICS_DATABASE_URL is not set");
	}

	const client = postgres(dbUrl, {
		max: maxConnections,
	});

	const db = drizzle(client, {
		schema,
	});

	return { db, client };
};

const { db: analyticsDb } = initAnalyticsDb();
export { analyticsDb };
export type AnalyticsDb = NonNullable<ReturnType<typeof initAnalyticsDb>>["db"];
