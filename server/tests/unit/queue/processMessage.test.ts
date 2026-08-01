import { describe, expect, test } from "bun:test";
import { ErrCode, RecaseError } from "@autumn/shared";
import { RedisUnavailableError } from "@/external/redis/utils/errors.js";
import { JobName } from "@/queue/JobName.js";
import { shouldRetrySqsJobError } from "@/queue/processMessage.js";

describe("shouldRetrySqsJobError", () => {
	test("does not retry permanent customer creation recovery failures", () => {
		expect(
			shouldRetrySqsJobError({
				jobName: JobName.CustomerCreationRecovery,
				error: new Error("requires manual billing review"),
			}),
		).toBe(false);
	});

	test("retries customer creation recovery on transient database errors", () => {
		expect(
			shouldRetrySqsJobError({
				jobName: JobName.CustomerCreationRecovery,
				error: Object.assign(new Error("connect timeout"), {
					code: "CONNECT_TIMEOUT",
				}),
			}),
		).toBe(true);
	});

	test("retries customer creation recovery on transient Redis errors", () => {
		expect(
			shouldRetrySqsJobError({
				jobName: JobName.CustomerCreationRecovery,
				error: new RedisUnavailableError({
					source: "customerCreationRecovery",
					reason: "timeout",
				}),
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

describe("shouldRetrySqsJobError - auto top-up lock contention", () => {
	const lockError = new RecaseError({
		message:
			"Another billing operation is already in progress for customer cus_1",
		code: ErrCode.LockAlreadyExists,
		statusCode: 423,
	});

	test("retries the first deliveries so a brief attach collision resolves", () => {
		expect(
			shouldRetrySqsJobError({
				jobName: JobName.AutoTopUp,
				error: lockError,
				receiveCount: 1,
			}),
		).toBe(true);
	});

	test("stops retrying once the delivery cap is reached", () => {
		expect(
			shouldRetrySqsJobError({
				jobName: JobName.AutoTopUp,
				error: lockError,
				receiveCount: 3,
			}),
		).toBe(false);
	});

	test("does not retry non-lock auto top-up failures", () => {
		expect(
			shouldRetrySqsJobError({
				jobName: JobName.AutoTopUp,
				error: new Error("card declined"),
				receiveCount: 1,
			}),
		).toBe(false);
	});
});
