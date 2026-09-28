import { getHeraldEnv } from "@autumn/env/herald";
import { createEventsDb, type EventsDb } from "@autumn/postgres";

const EVENTS_DATABASE_POOL_SIZE = 4;

let eventsDb: EventsDb | undefined;

export function getEventsDb(): EventsDb {
	eventsDb ??= createEventsDb({
		config: {
			databaseUrl: getHeraldEnv().HERALD_EVENTS_DATABASE_URL,
			maxConnections: EVENTS_DATABASE_POOL_SIZE,
		},
	});
	return eventsDb;
}
