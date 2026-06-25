import { UnixMsTimestampSchema } from "../../billing/common/unixMsTimestamp";

export const TrackTimestampSchema = UnixMsTimestampSchema.positive()
	.refine((timestamp) => timestamp <= Date.now(), {
		message: "timestamp cannot be in the future",
	})
	.meta({
		description:
			"Unix timestamp in milliseconds to use for the usage event. Defaults to the current time.",
	});
