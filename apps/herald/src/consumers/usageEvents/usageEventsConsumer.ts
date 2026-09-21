import type { AutumnLogger } from "@autumn/logging";
import type { EventsDb } from "@autumn/postgres";
import type { EventInsert } from "@autumn/shared";
import type {
	StreamConsumer,
	StreamRecord,
} from "../../stream/types/streamConsumer.js";
import { recordToUsageEvent } from "./actions/recordToUsageEvent.js";

/** A batch of records in, one insert out. A replayed record makes the same event id, which the insert skips. */
export function createUsageEventsConsumer({
	ctx,
}: {
	ctx: { eventsDb: Pick<EventsDb, "insertUsageEvents">; logger: AutumnLogger };
}): StreamConsumer {
	async function handle({
		records,
	}: {
		records: StreamRecord[];
	}): Promise<void> {
		const events: EventInsert[] = [];
		for (const record of records) {
			const event = recordToUsageEvent(record);
			if (event) events.push(event);
		}
		const { refused } = await ctx.eventsDb.insertUsageEvents({ events });
		// Set aside so the rest of the batch lands; loud, because a refused event is usage nobody will see.
		for (const { event, cause } of refused) {
			ctx.logger.error(
				{
					error: cause,
					type: "herald_usage_event_refused",
					data: { id: event.id },
				},
				"Herald could not store a usage event",
			);
		}
	}

	return { name: "usage-events", handle };
}
