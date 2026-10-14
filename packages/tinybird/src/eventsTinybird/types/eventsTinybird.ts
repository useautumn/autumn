import type { EventInsert } from "@autumn/shared";
import type { TinybirdRegion } from "../../types/tinybirdClient.js";

export type EventsTinybirdConfig = {
	region: TinybirdRegion;
	fetch?: typeof fetch;
};

export type EventsTinybird = {
	sendUsageEvents(params: { events: EventInsert[] }): Promise<void>;
};
