import { createPostgresClient } from "../createPostgresClient.js";
import { insertUsageEvents } from "./repos/usageEvents.js";
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
		close: () => postgres.close(),
	};
};
