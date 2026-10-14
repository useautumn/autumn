import type { EventInsert } from "@autumn/shared";
import type { UsageEventsInsertResult } from "../repos/usageEvents.js";

export type EventsDb = {
	insertUsageEvents(params: {
		events: EventInsert[];
	}): Promise<UsageEventsInsertResult>;
	readUnsentToTinybirdIds(params: { ids: string[] }): Promise<string[]>;
	markSentToTinybird(params: { ids: string[]; at: Date }): Promise<void>;
	ping(): Promise<void>;
	close(): Promise<void>;
};
