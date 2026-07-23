import { describe, expect, test } from "bun:test";
import { RedisUnavailableError } from "@/external/redis/utils/errors.js";
import { JobName } from "@/queue/JobName.js";
import { shouldRetrySqsJobError } from "@/queue/processMessage.js";

describe("shouldRetrySqsJobError", () => {
	test("retries Stripe webhook jobs on any processing error", () => {
		expect(
			shouldRetrySqsJobError({
				jobName: JobName.StripeWebhook,
				error: new Error("handler failed"),
			}),
		).toBe(true);
	});

	test("keeps customer creation recovery failures for retry and DLQ redrive", () => {
		expect(
			shouldRetrySqsJobError({
				jobName: JobName.CustomerCreationRecovery,
				error: new Error("requires manual billing review"),
			}),
		).toBe(true);
	});

	test("retries track jobs on transient Redis errors", () => {
		expect(
			shouldRetrySqsJobError({
				jobName: JobName.Track,
				error: new RedisUnavailableError({
					source: "runTrackV3",
					reason: "timeout",
				}),
			}),
		).toBe(true);
	});

	test("does not retry track jobs on non-transient application errors", () => {
		expect(
			shouldRetrySqsJobError({
				jobName: JobName.Track,
				error: new Error("insufficient balance"),
			}),
		).toBe(false);
	});
});
