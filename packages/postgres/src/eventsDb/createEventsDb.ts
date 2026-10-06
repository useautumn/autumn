import { sql } from "drizzle-orm";
import { createPostgresClient } from "../createPostgresClient.js";
import type { PostgresLogger } from "../types/postgresClient.js";
import {
	insertUsageEvents,
	markSentToTinybird,
	readUnsentToTinybirdIds,
} from "./repos/usageEvents.js";
import type { EventsDb, EventsDbConfig } from "./types/eventsDb.js";

const CONNECT_TIMEOUT_SECONDS = 10;
const IDLE_TIMEOUT_SECONDS = 30;
const QUERY_TIMEOUT_SECONDS = 30;

/** One pool on the events database, with its repos bound to it. The caller owns it and closes it. */
export const createEventsDb = ({
	ctx: { logger },
	config,
}: {
	ctx: { logger: PostgresLogger };
	config: EventsDbConfig;
}): EventsDb => {
	const postgres = createPostgresClient({
		ctx: { logger },
		config: {
			...config,
			connectTimeout: CONNECT_TIMEOUT_SECONDS,
			idleTimeout: IDLE_TIMEOUT_SECONDS,
			queryTimeout: QUERY_TIMEOUT_SECONDS,
		},
	});
	const ctx = { db: postgres.db };
	return {
		insertUsageEvents: ({ events }) =>
			insertUsageEvents({ ctx: { client: postgres.client }, events }),
		readUnsentToTinybirdIds: ({ ids }) => readUnsentToTinybirdIds({ ctx, ids }),
		markSentToTinybird: ({ ids, at }) => markSentToTinybird({ ctx, ids, at }),
		ping: async () => {
			await ctx.db.execute(sql`select 1`);
		},
		close: () => postgres.close(),
	};
};
