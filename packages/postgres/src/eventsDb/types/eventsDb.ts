import type { EventInsert } from "@autumn/shared";
import type { UsageEventsInsertResult } from "../repos/usageEvents.js";

export type EventsDbConfig = {
	databaseUrl: string;
	/** Pool ceiling; counts against the events database's connection budget per process. */
	maxConnections: number;
};

/** The usage events database: a separate Postgres from the main one in production. */
export type EventsDb = {
	insertUsageEvents(params: {
		events: EventInsert[];
	}): Promise<UsageEventsInsertResult>;
	close(): Promise<void>;
};
