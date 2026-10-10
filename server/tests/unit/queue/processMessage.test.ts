import { describe, expect, test } from "bun:test";
import { RecaseError } from "@autumn/shared";
import { RedisUnavailableError } from "@/external/redis/utils/errors.js";
import {
	RedisDeductionError,
	RedisDeductionErrorCode,
} from "@/internal/balances/utils/types/redisDeductionError.js";
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

	test("retries creation recovery when the balance worker gave no verdict", () => {
		const workerUnavailable = new RecaseError({
			code: "balance_worker_unavailable",
			statusCode: 503,
			message: "Balance worker is temporarily unavailable",
		});
		expect(
			shouldRetrySqsJobError({
				jobName: JobName.CustomerCreationRecovery,
				error: workerUnavailable,
			}),
		).toBe(true);
		expect(
			shouldRetrySqsJobError({
				jobName: JobName.EntityCreationRecovery,
				error: workerUnavailable,
			}),
		).toBe(true);
	});

	test("does not retry entity creation recovery on a 4xx verdict", () => {
		expect(
			shouldRetrySqsJobError({
				jobName: JobName.EntityCreationRecovery,
				error: new RecaseError({
					code: "feature_limit_reached",
					statusCode: 400,
					message: "limit",
				}),
			}),
		).toBe(false);
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

	test("retries track jobs when the subject view changes", () => {
		expect(
			shouldRetrySqsJobError({
				jobName: JobName.Track,
				error: new RedisDeductionError({
					message: "Subject view changed",
					code: RedisDeductionErrorCode.SubjectViewChanged,
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

	test("retries stripe webhook replay on handler errors that would 500 Stripe", () => {
		expect(
			shouldRetrySqsJobError({
				jobName: JobName.StripeWebhookReplay,
				error: new Error("duplicate key value violates unique constraint"),
			}),
		).toBe(true);
	});

	test("does not retry stripe webhook replay on errors that would not 500 Stripe", () => {
		expect(
			shouldRetrySqsJobError({
				jobName: JobName.StripeWebhookReplay,
				error: new Error("Not a valid URL"),
			}),
		).toBe(false);
	});
});
