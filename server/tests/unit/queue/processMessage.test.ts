import { describe, expect, test } from "bun:test";
import {
	BalanceHandoffInProgressError,
	RedisUnavailableError,
} from "@/external/redis/utils/errors.js";
import { RetryableBalanceSyncError } from "@/internal/balances/utils/sync/syncItemV4.js";
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

	test("retries balance sync jobs when the generation preflight cannot read Redis", () => {
		expect(
			shouldRetrySqsJobError({
				jobName: JobName.SyncBalanceBatchV4,
				error: new RedisUnavailableError({
					source: "syncItemV4",
					reason: "timeout",
				}),
			}),
		).toBe(true);
	});

	test("retries direct and coalesced sync jobs during a balance handoff", () => {
		const error = new RetryableBalanceSyncError({
			reason: "postgres_conflict",
		});

		for (const jobName of [
			JobName.SyncBalanceBatchV4,
			JobName.SyncCustomerDirty,
		]) {
			expect(shouldRetrySqsJobError({ jobName, error })).toBe(true);
		}
	});

	test("retries a queued track while attach owns a cold cache fill", () => {
		expect(
			shouldRetrySqsJobError({
				jobName: JobName.Track,
				error: new BalanceHandoffInProgressError(),
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
