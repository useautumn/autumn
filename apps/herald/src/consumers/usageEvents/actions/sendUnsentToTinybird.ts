import type { EventInsert } from "@autumn/shared";
import { type EventsTinybird, TinybirdIngestError } from "@autumn/tinybird";
import type { StreamRecord } from "../../../stream/types/streamConsumer.js";

/** Rows each batch has already written to Tinybird, keyed by the records herald retries it with. */
export type TinybirdProgress = WeakMap<StreamRecord[], number>;

/** Tinybird cannot skip a repeat, so a retried batch sends only the events its earlier attempts did not write. */
export const sendUnsentToTinybird = async ({
	eventsTinybird,
	progress,
	records,
	events,
}: {
	eventsTinybird: EventsTinybird | null;
	progress: TinybirdProgress;
	records: StreamRecord[];
	events: EventInsert[];
}): Promise<void> => {
	const written = progress.get(records) ?? 0;
	try {
		await eventsTinybird?.sendUsageEvents({ events: events.slice(written) });
	} catch (error) {
		if (error instanceof TinybirdIngestError)
			progress.set(records, written + error.writtenRows);
		throw error;
	}
	progress.set(records, events.length);
};
