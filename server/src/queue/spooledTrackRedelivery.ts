import { SpooledTrackTooOldError } from "@/internal/balances/track/balanceWorker/spool/spooledTrackErrors.js";
import { JobName } from "./JobName.js";
import type { SqsJob } from "./processMessage.js";

/** After failed receives 1-4. With the queue's 5 receives, the 5th lands ~5 min after the first, leaving 2 min of
 *  queue wait before the 7-min replay cap, where the receive visibility alone would DLQ the track after ~2.5 min. */
const SPOOLED_TRACK_REDELIVERY_DELAYS_SECONDS = [20, 40, 90, 150] as const;

/** How long a spooled track's failed replay stays invisible, or null to keep the receive's own visibility. */
export const spooledTrackRedeliveryDelaySeconds = ({
	job,
	error,
	receiveCount,
}: {
	job: SqsJob;
	error: unknown;
	receiveCount: number;
}): number | null => {
	if (job.name !== JobName.Track || job.data?.spooledAt === undefined)
		return null;
	// Past the cap it is headed for the DLQ; holding it back would only delay that.
	if (error instanceof SpooledTrackTooOldError) return null;
	return SPOOLED_TRACK_REDELIVERY_DELAYS_SECONDS[receiveCount - 1] ?? null;
};
