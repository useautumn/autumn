import { UnixMsTimestampSchema } from "../../billing/common/unixMsTimestamp";

export const MAX_TRACK_TIMESTAMP_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export const TrackTimestampSchema = UnixMsTimestampSchema.positive()
	.refine((timestamp) => timestamp >= Date.now() - MAX_TRACK_TIMESTAMP_AGE_MS, {
		message: "timestamp cannot be more than 30 days in the past",
	})
	.refine((timestamp) => timestamp <= Date.now(), {
		message: "timestamp cannot be in the future",
	})
	.meta({
		description:
			"Unix timestamp in milliseconds to use for the usage event. Defaults to the current time.",
	});
