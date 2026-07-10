import { type DrizzleCli, initDrizzle } from "./initDrizzle.js";

// GUARD: initDrizzle falls back to DATABASE_URL when no url is given — never let events
// writes silently hit the main DB. Pool exists only when the Neon URL is configured.
export const neonEventsDb: DrizzleCli | null = process.env
	.NEON_EVENTS_DATABASE_URL
	? initDrizzle({
			name: "neon-events",
			databaseUrl: process.env.NEON_EVENTS_DATABASE_URL, // POOLED (-pooler) endpoint
			maxConnections: 5,
			connectTimeout: 10,
			poolConfig: { application_name: "autumn-neon-events", query_timeout: 10_000 },
		}).db
	: null;
