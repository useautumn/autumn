import type { AutoTopUpSuppressionContext } from "@autumn/cache";
import type { autoTopupJob, JobPayload, SqsJobs } from "@autumn/sqs";

export type AutoTopupJobPayload = JobPayload<typeof autoTopupJob>;

export type AutoTopupDispatchContext = AutoTopUpSuppressionContext & {
	sqsJobs: Pick<SqsJobs, "autoTopup">;
};

export type AutoTopupDispatchResult =
	| { enqueued: true; reason: "enqueued" }
	| {
			enqueued: false;
			reason: "pending_key_exists" | "redis_unavailable" | "send_failed";
	  };
