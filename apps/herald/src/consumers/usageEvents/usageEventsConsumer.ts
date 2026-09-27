import type { AutumnLogger } from "@autumn/logging";
import type { EventsDb } from "@autumn/postgres";
import type { EventInsert } from "@autumn/shared";
import type { EventsTinybird } from "@autumn/tinybird";
import type {
	StreamConsumer,
	StreamRecord,
} from "../../stream/types/streamConsumer.js";
import { recordToUsageEvent } from "./actions/recordToUsageEvent.js";

/** One event built once feeds both stores. A replayed record makes the same event id, which the insert skips. */
export function createUsageEventsConsumer({
	ctx,
}: {
	ctx: {
		eventsDb: Pick<EventsDb, "insertUsageEvents">;
		eventsTinybird: EventsTinybird | null;
		logger: Pick<AutumnLogger, "error">;
	};
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
		// Tinybird first: it cannot skip a repeat, so a crash after it may repeat one batch, never lose one.
		await ctx.eventsTinybird?.sendUsageEvents({ events });
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
