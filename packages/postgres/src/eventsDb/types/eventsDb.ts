import type { EventInsert } from "@autumn/shared";
import type { UsageEventsInsertResult } from "../repos/usageEvents.js";

export type EventsDbConfig = {
	databaseUrl: string;
	/** Names the pool's connections in pg_stat_activity and the bouncer's logs. */
	applicationName: string;
	/** Pool ceiling; counts against the events database's connection budget per process. */
	maxConnections: number;
};

/** The usage events database: a separate Postgres from the main one in production. */
export type EventsDb = {
	insertUsageEvents(params: {
		events: EventInsert[];
	}): Promise<UsageEventsInsertResult>;
	readUnsentToTinybirdIds(params: { ids: string[] }): Promise<string[]>;
	markSentToTinybird(params: { ids: string[]; at: Date }): Promise<void>;
	/** One round trip that proves the database answers; a readiness probe. */
	ping(): Promise<void>;
	close(): Promise<void>;
};
