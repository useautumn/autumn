import { getHeraldEnv } from "@autumn/env/herald";
import { createEventsDb, type EventsDb } from "@autumn/postgres";
import { getHeraldLogger } from "./getHeraldLogger.js";

const EVENTS_DATABASE_POOL_SIZE = 4;

let eventsDb: EventsDb | undefined;

export function getEventsDb(): EventsDb {
	eventsDb ??= createEventsDb({
		ctx: { logger: getHeraldLogger() },
		config: {
			databaseUrl: getHeraldEnv().HERALD_EVENTS_DATABASE_URL,
			applicationName: "autumn-herald-events",
			maxConnections: EVENTS_DATABASE_POOL_SIZE,
		},
	});
	return eventsDb;
}
