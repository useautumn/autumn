import { sql } from "drizzle-orm";
import { createPostgresClient } from "../createPostgresClient.js";
import {
	insertUsageEvents,
	markSentToTinybird,
	readUnsentToTinybirdIds,
} from "./repos/usageEvents.js";
import type { EventsDb, EventsDbConfig } from "./types/eventsDb.js";

const CONNECT_TIMEOUT_SECONDS = 10;
const IDLE_TIMEOUT_SECONDS = 30;
const MAX_LIFETIME_SECONDS = 1800;

/** One pool on the events database, with its repos bound to it. The caller owns it and closes it. */
export const createEventsDb = ({
	config,
}: {
	config: EventsDbConfig;
}): EventsDb => {
	const postgres = createPostgresClient({
		config: {
			...config,
			connectTimeout: CONNECT_TIMEOUT_SECONDS,
			idleTimeout: IDLE_TIMEOUT_SECONDS,
			maxLifetime: MAX_LIFETIME_SECONDS,
		},
	});
	const ctx = { db: postgres.db };
	return {
		insertUsageEvents: ({ events }) => insertUsageEvents({ ctx, events }),
		readUnsentToTinybirdIds: ({ ids }) => readUnsentToTinybirdIds({ ctx, ids }),
		markSentToTinybird: ({ ids, at }) => markSentToTinybird({ ctx, ids, at }),
		ping: async () => {
			await ctx.db.execute(sql`select 1`);
		},
		close: () => postgres.close(),
	};
};
