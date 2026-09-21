import type { EventInsert } from "@autumn/shared";
import type { TinybirdRegion } from "../../types/tinybirdClient.js";

export type EventsTinybirdConfig = {
	region: TinybirdRegion;
	fetch?: typeof fetch;
};

/** The Tinybird workspace that holds usage events. */
export type EventsTinybird = {
	/** Resolves once Tinybird has taken the rows; throws when it has not. */
	sendUsageEvents(params: { events: EventInsert[] }): Promise<void>;
};
