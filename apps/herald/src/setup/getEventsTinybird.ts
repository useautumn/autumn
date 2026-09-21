import { getHeraldEnv } from "@autumn/env/herald";
import { createEventsTinybird, type EventsTinybird } from "@autumn/tinybird";
import { getHeraldLogger } from "./getHeraldLogger.js";

let eventsTinybird: EventsTinybird | null | undefined;

/** Null where Tinybird is not set up. */
export function getEventsTinybird(): EventsTinybird | null {
	if (eventsTinybird !== undefined) return eventsTinybird;
	const { HERALD_TINYBIRD } = getHeraldEnv();
	eventsTinybird = HERALD_TINYBIRD
		? createEventsTinybird({
				ctx: { logger: getHeraldLogger() },
				config: { region: HERALD_TINYBIRD },
			})
		: null;
	return eventsTinybird;
}
