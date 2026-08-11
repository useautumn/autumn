import { describe, expect, test } from "bun:test";
import { ErrCode, RecaseError } from "@autumn/shared";
import { shed503OnTransientError } from "@/db/shed503OnTransientError.js";
import { RedisUnavailableError } from "@/external/redis/utils/errors.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
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

	test("retries customer creation recovery when the replay itself sheds", async () => {
		const ctx = {
			logger: { warn: () => {}, error: () => {} },
		} as unknown as AutumnContext;

		const shedError = await shed503OnTransientError({
			ctx,
			source: "entities.create",
			run: () => {
				throw Object.assign(new Error("connect timeout"), {
					code: "CONNECT_TIMEOUT",
				});
			},
		}).catch((error: unknown) => error);

		expect(
			shouldRetrySqsJobError({
				jobName: JobName.CustomerCreationRecovery,
				error: shedError,
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
	test("retries a recovery job that collided with a live entity create", () => {
		// The capture is fine; something else just held the customer lock.
		expect(
			shouldRetrySqsJobError({
				jobName: JobName.CustomerCreationRecovery,
				error: new RecaseError({
					message: "Entity creation already in progress for this customer",
					code: ErrCode.LockAlreadyExists,
					statusCode: 423,
				}),
			}),
		).toBe(true);
	});
});
