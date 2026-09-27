import type { AutumnLogger } from "@autumn/logging";
import type { PushResult } from "../actions/pushHourlyMeters/types/pushResult";
import type { TrackItem } from "../actions/pushHourlyMeters/types/trackItem";
import type { AutumnClient } from "../types/autumnClient";

/** batch_track accepts at most this many items per call. */
export const BATCH_TRACK_MAX_ITEMS = 1000;

const chunk = <T>(items: T[], size: number): T[][] =>
	Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
		items.slice(index * size, (index + 1) * size),
	);

/** Sends items in batch_track-sized chunks; a failed chunk is counted and reported, not retried here. */
export const pushTrackItems = async ({
	ctx,
	items,
}: {
	ctx: {
		autumn: Pick<AutumnClient, "batchTrack">;
		logger: Pick<AutumnLogger, "error">;
	};
	items: TrackItem[];
}): Promise<PushResult> => {
	const result: PushResult = { pushed: 0, failed: 0, errors: [] };

	for (const batch of chunk(items, BATCH_TRACK_MAX_ITEMS)) {
		try {
			await ctx.autumn.batchTrack({ items: batch });
			result.pushed += batch.length;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			result.failed += batch.length;
			result.errors.push(message);
			ctx.logger.error("[metering] batch_track chunk failed", {
				data: { items: batch.length, error: message },
			});
		}
	}

	return result;
};
