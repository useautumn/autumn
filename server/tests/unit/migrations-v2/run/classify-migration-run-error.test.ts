import { describe, expect, test } from "bun:test";
import { MigrationRunErrorCode } from "@autumn/shared";
import { SubtaskUnwrapError } from "@trigger.dev/sdk/v3";
import Stripe from "stripe";
import { classifyMigrationRunError } from "@/internal/migrations/v2/actions/migrationRun/classifyMigrationRunError.js";
import {
	BatchMigrationCacheInvalidationError,
	BatchMigrationPageLimitError,
	BatchMigrationStallError,
} from "@/internal/migrations/v2/batchOperations/execute/errors/batchMigrationErrors.js";

const CHUNK_TASK_ID = "run-batch-migration-chunk";

/** Trigger serializes a child task's error to `{ name, message }`, so the
 * parent sees a plain Error carrying only the original name. */
const serializedAcrossTasks = (error: Error): Error => {
	const deserialized = new Error(error.message);
	deserialized.name = error.name;
	return deserialized;
};

const unwrappedFromChunk = (error: Error) =>
	new SubtaskUnwrapError(
		CHUNK_TASK_ID,
		"run_123",
		serializedAcrossTasks(error),
	);

const triggerInternalError = (code: string) => {
	const error = new Error(`Internal error (${code})`);
	error.name = code;
	return error;
};

const cacheInvalidationError = new BatchMigrationCacheInvalidationError({
	message:
		"batch-migration: cache invalidation did not complete for 1 page(s) (0 timed out; page 1); checkpoints revoked for retry where the revoke succeeded (see per-page logs)",
});

describe("classifyMigrationRunError", () => {
	test("a chunk's cache invalidation failure, unwrapped from the subtask", () => {
		const error = unwrappedFromChunk(cacheInvalidationError);
		expect(error.message).toStartWith(`Error in ${CHUNK_TASK_ID}:`);
		expect(classifyMigrationRunError({ error })).toBe(
			MigrationRunErrorCode.CacheInvalidationIncomplete,
		);
	});

	test("a cache invalidation failure raised in-process", () => {
		expect(classifyMigrationRunError({ error: cacheInvalidationError })).toBe(
			MigrationRunErrorCode.CacheInvalidationIncomplete,
		);
	});

	test("a stalled page is a timeout", () => {
		const stall = new BatchMigrationStallError({
			phase: "page_execute",
			message: "batch-migration: page 3 made no progress for 300000ms",
		});
		expect(classifyMigrationRunError({ error: stall })).toBe(
			MigrationRunErrorCode.TimedOut,
		);
		expect(
			classifyMigrationRunError({ error: unwrappedFromChunk(stall) }),
		).toBe(MigrationRunErrorCode.TimedOut);
	});

	test("trigger's max duration and heartbeat limits are timeouts", () => {
		for (const code of ["MAX_DURATION_EXCEEDED", "TASK_RUN_HEARTBEAT_TIMEOUT"])
			expect(
				classifyMigrationRunError({
					error: unwrappedFromChunk(triggerInternalError(code)),
				}),
			).toBe(MigrationRunErrorCode.TimedOut);
	});

	test("a canceled subtask is a cancellation", () => {
		expect(
			classifyMigrationRunError({
				error: unwrappedFromChunk(triggerInternalError("TASK_RUN_CANCELLED")),
			}),
		).toBe(MigrationRunErrorCode.Canceled);
	});

	test("a crashed or killed task is an interruption", () => {
		for (const code of ["TASK_RUN_CRASHED", "TASK_PROCESS_OOM_KILLED"])
			expect(
				classifyMigrationRunError({
					error: unwrappedFromChunk(triggerInternalError(code)),
				}),
			).toBe(MigrationRunErrorCode.Interrupted);
	});

	test("a Stripe API error", () => {
		const stripeError = new Stripe.errors.StripeRateLimitError({
			type: "rate_limit_error",
			message: "Request rate limit exceeded.",
		});
		expect(classifyMigrationRunError({ error: stripeError })).toBe(
			MigrationRunErrorCode.StripeError,
		);
	});

	test("the runaway page backstop", () => {
		const error = unwrappedFromChunk(
			new BatchMigrationPageLimitError({ maxPages: 2000 }),
		);
		expect(classifyMigrationRunError({ error })).toBe(
			MigrationRunErrorCode.PageLimitExceeded,
		);
	});

	test("anything else falls back to unknown", () => {
		expect(
			classifyMigrationRunError({
				error: new Error(
					"Migration chunk made no progress before continuation",
				),
			}),
		).toBe(MigrationRunErrorCode.Unknown);
		expect(classifyMigrationRunError({ error: "a thrown string" })).toBe(
			MigrationRunErrorCode.Unknown,
		);
		expect(classifyMigrationRunError({ error: undefined })).toBe(
			MigrationRunErrorCode.Unknown,
		);
	});
});
