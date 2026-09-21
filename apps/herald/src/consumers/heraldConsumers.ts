import type { AutumnLogger } from "@autumn/logging";
import type { EventsDb } from "@autumn/postgres";
import type { EventsTinybird } from "@autumn/tinybird";
import type { StreamConsumer } from "../stream/types/streamConsumer.js";
import { createUsageEventsConsumer } from "./usageEvents/usageEventsConsumer.js";

/** Every job herald runs. A new job is a folder beside these and one line here. */
export function createHeraldConsumers({
	ctx,
}: {
	ctx: {
		eventsDb: EventsDb;
		eventsTinybird: EventsTinybird | null;
		logger: AutumnLogger;
	};
}): StreamConsumer[] {
	return [createUsageEventsConsumer({ ctx })];
}
