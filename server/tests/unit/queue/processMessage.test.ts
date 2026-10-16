import { describe, expect, test } from "bun:test";
import { BalanceWorkerClientError } from "@autumn/balance-worker-client";
import { RecaseError } from "@autumn/shared";
import { RedisUnavailableError } from "@/external/redis/utils/errors.js";
import { SpooledTrackTooOldError } from "@/internal/balances/track/balanceWorker/spool/spooledTrackErrors.js";
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

	test("retries track jobs when the subject view changed mid-deduction", () => {
		expect(
			shouldRetrySqsJobError({
				jobName: JobName.Track,
				error: new RedisDeductionError({
					message: "Redis deduction failed: SUBJECT_VIEW_CHANGED",
					code: RedisDeductionErrorCode.SubjectViewChanged,
				}),
			}),
		).toBe(true);
	});

	test("does not retry track jobs on other Redis deduction errors", () => {
		expect(
			shouldRetrySqsJobError({
				jobName: JobName.Track,
				error: new RedisDeductionError({
					message: "Redis deduction failed: INSUFFICIENT_BALANCE",
					code: RedisDeductionErrorCode.InsufficientBalance,
				}),
			}),
		).toBe(false);
	});

	test("does not retry track jobs on non-transient application errors", () => {
		expect(
			shouldRetrySqsJobError({
				jobName: JobName.Track,
				error: new Error("insufficient balance"),
			}),
		).toBe(false);
	});

	test("retries track jobs while the balance worker gives no verdict or applies nothing", () => {
		const retriable = [
			new RecaseError({
				code: "balance_worker_unavailable",
				statusCode: 503,
				message: "Balance worker is temporarily unavailable",
			}),
			new RecaseError({
				code: "balance_worker_result_unknown",
				statusCode: 503,
				message: "Balance worker did not confirm the command",
			}),
			new RecaseError({
				code: "balance_worker_overloaded",
				statusCode: 429,
				message: "Too many concurrent requests for this customer",
			}),
			new RecaseError({
				code: "balance_worker_stale_subject",
				statusCode: 409,
				message: "Customer changed while the command was decided",
			}),
			new BalanceWorkerClientError({
				code: "WORKER_ERROR",
				outcome: "unknown",
				message: "Worker answered 500",
			}),
			new SpooledTrackTooOldError({ ageMs: 900_000 }),
		];
		for (const error of retriable)
			expect(shouldRetrySqsJobError({ jobName: JobName.Track, error })).toBe(
				true,
			);
	});

	test("does not retry track jobs on a balance worker verdict", () => {
		expect(
			shouldRetrySqsJobError({
				jobName: JobName.Track,
				error: new RecaseError({
					code: "balance_worker_record_refused",
					statusCode: 500,
					message: "Balance worker could not store this command",
				}),
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

	test("does not retry stripe webhook replay on Postgres foreign-key violations", () => {
		const foreignKeyError = Object.assign(
			new Error(
				'insert or update on table "customer_prices" violates foreign key constraint "customer_prices_price_id_fkey"',
			),
			{ code: "23503" },
		);

		expect(
			shouldRetrySqsJobError({
				jobName: JobName.StripeWebhookReplay,
				error: foreignKeyError,
			}),
		).toBe(false);
	});

	test("does not retry stripe webhook replay on wrapped foreign-key violations", () => {
		expect(
			shouldRetrySqsJobError({
				jobName: JobName.StripeWebhookReplay,
				error: new Error(
					'insert or update on table "customer_prices" violates foreign key constraint "customer_prices_price_id_fkey"',
				),
			}),
		).toBe(false);
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
