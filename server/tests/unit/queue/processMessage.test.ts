import { describe, expect, test } from "bun:test";
import { ErrCode, RecaseError } from "@autumn/shared";
import { RedisUnavailableError } from "@/external/redis/utils/errors.js";
import { JobName } from "@/queue/JobName.js";
import { shouldRetrySqsJobError } from "@/queue/processMessage.js";

describe("shouldRetrySqsJobError", () => {
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

	test("retries auto top-up jobs after billing-lock contention", () => {
		expect(
			shouldRetrySqsJobError({
				jobName: JobName.AutoTopUp,
				error: new RecaseError({
					message: "Another billing operation is in progress",
					code: ErrCode.LockAlreadyExists,
					statusCode: 423,
				}),
			}),
		).toBe(true);
	});

	test("retries auto top-up jobs after transient Redis failures", () => {
		expect(
			shouldRetrySqsJobError({
				jobName: JobName.AutoTopUp,
				error: new RedisUnavailableError({
					source: "autoTopup",
					reason: "timeout",
				}),
			}),
		).toBe(true);
	});
});
