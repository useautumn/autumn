import { getPostgresPools } from "@autumn/postgres";
import { type DrizzleCli, initDrizzle } from "./initDrizzle.js";

export const neonEventsDb: DrizzleCli | null = process.env
	.NEON_EVENTS_DATABASE_URL
	? initDrizzle({
			name: "neon-events",
			databaseUrl: process.env.NEON_EVENTS_DATABASE_URL,
			pool: getPostgresPools().neonEvents,
		}).db
	: null;
