import type { AutumnLogger } from "@autumn/logging";
import type { EventsDb } from "@autumn/postgres";
import type { EventInsert } from "@autumn/shared";
import { type EventsTinybird, TinybirdIngestError } from "@autumn/tinybird";
import type {
	StreamConsumer,
	StreamReadSize,
	StreamRecord,
} from "../../stream/types/streamConsumer.js";
import { recordToUsageEvent } from "./actions/recordToUsageEvent.js";

/** 2,000 rows still cost one Tinybird request, one read and one mark (two inserts): under a third of 500's round trips per row.
 *  A 5,000-record poll gives a hot partition two full slices a round, or lets several behind partitions land side by side. */
const READ_SIZE: StreamReadSize = {
	recordsPerPoll: 5_000,
	recordsPerSlice: 2_000,
};

/**
 * Postgres is the ledger, Tinybird follows it. A slice inserts (a repeat is skipped by id), sends Tinybird only the
 * rows it has not confirmed, then marks them. So a slice landed twice sends once, and a crash before the mark
 * sends again rather than never: Tinybird cannot skip a repeat, so the mark comes last.
 */
export function createUsageEventsConsumer({
	ctx,
}: {
	ctx: {
		eventsDb: Pick<
			EventsDb,
			"insertUsageEvents" | "readUnsentToTinybirdIds" | "markSentToTinybird"
		>;
		eventsTinybird: EventsTinybird | null;
		logger: Pick<AutumnLogger, "error">;
		now?: () => Date;
	};
}): StreamConsumer {
	const now = ctx.now ?? defaultNow;

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
		await sendUnsentToTinybird({ events });
	}

	/** A request that failed after writing some rows marks those, so the retry does not send them twice. */
	async function sendUnsentToTinybird({
		events,
	}: {
		events: EventInsert[];
	}): Promise<void> {
		if (!ctx.eventsTinybird) return;
		const unsentIds = new Set(
			await ctx.eventsDb.readUnsentToTinybirdIds({
				ids: events.map(({ id }) => id),
			}),
		);
		const unsent = events.filter(({ id }) => unsentIds.has(id));
		if (unsent.length === 0) return;
		try {
			await ctx.eventsTinybird.sendUsageEvents({ events: unsent });
		} catch (cause) {
			if (cause instanceof TinybirdIngestError)
				await markSent({ events: unsent.slice(0, cause.writtenRows) });
			throw cause;
		}
		await markSent({ events: unsent });
	}

	function markSent({ events }: { events: EventInsert[] }): Promise<void> {
		return ctx.eventsDb.markSentToTinybird({
			ids: events.map(({ id }) => id),
			at: now(),
		});
	}

	return { name: "usage-events", readSize: READ_SIZE, handle };
}

function defaultNow(): Date {
	return new Date();
}
