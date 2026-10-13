import { getHeraldEnv } from "@autumn/env/herald";
import {
	createEventsDb,
	type EventsDb,
	getPostgresPools,
} from "@autumn/postgres";
import { getHeraldLogger } from "./getHeraldLogger.js";

let eventsDb: EventsDb | undefined;

export function getEventsDb(): EventsDb {
	eventsDb ??= createEventsDb({
		ctx: { logger: getHeraldLogger() },
		config: {
			databaseUrl: getHeraldEnv().HERALD_EVENTS_DATABASE_URL,
			...getPostgresPools().heraldEvents,
		},
	});
	return eventsDb;
}
