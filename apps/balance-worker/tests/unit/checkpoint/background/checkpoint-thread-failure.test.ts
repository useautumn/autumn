import { describe, expect, test } from "bun:test";
import {
	deserializeCheckpointThreadFailure,
	PartitionCheckpointThreadError,
	serializeCheckpointThreadFailure,
} from "../../../../src/checkpoint/background/checkpointThreadFailure.js";
import { PartitionCheckpointBodyLimitExceededError } from "../../../../src/checkpoint/partitionCheckpointEncoding.js";
import { PartitionCheckpointCaptureError } from "../../../../src/checkpoint/partitionCheckpointExporter.js";
import { PartitionCheckpointLimitExceededError } from "../../../../src/checkpoint/partitionCheckpointLimits.js";
import { PartitionCheckpointPublisherError } from "../../../../src/checkpoint/partitionCheckpointPublisher.js";
import { checkpointFailureOf } from "../../../../src/checkpoint/scheduling/partitionCheckpointEntry.js";
import { createSchedulerFixture } from "../scheduling/scheduler-fixtures.js";

describe("checkpoint thread failures", () => {
	test.concurrent.each([
		new PartitionCheckpointLimitExceededError({
			limitName: "states",
			limit: 10,
			observed: 11,
		}),
		new PartitionCheckpointBodyLimitExceededError({
			limitName: "compressed_bytes",
			limit: 10,
			observed: 11,
		}),
		new PartitionCheckpointPublisherError({
			message: "S3 unavailable",
			retriable: true,
		}),
		new PartitionCheckpointPublisherError({
			message: "Access denied",
			retriable: false,
		}),
	])(
		"preserves health classification through structured cloning: %s",
		(cause) => {
			const failure = structuredClone(
				serializeCheckpointThreadFailure({ cause }),
			);
			const restored = deserializeCheckpointThreadFailure({ failure });
			expect(restored).toBeInstanceOf(cause.constructor);
			expect(checkpointFailureOf({ cause: restored })).toEqual(
				checkpointFailureOf({ cause }),
			);
		},
	);

	test.concurrent(
		"preserves a corrupt capture as a state failure, including its SQLite code",
		() => {
			const cause = new PartitionCheckpointCaptureError({
				cause: Object.assign(new Error("database disk image is malformed"), {
					code: "SQLITE_CORRUPT",
				}),
			});
			const restored = deserializeCheckpointThreadFailure({
				failure: structuredClone(serializeCheckpointThreadFailure({ cause })),
			});
			expect(restored).toBeInstanceOf(PartitionCheckpointCaptureError);
			expect(restored.cause).toMatchObject({
				message: "database disk image is malformed",
				code: "SQLITE_CORRUPT",
			});
		},
	);

	test.concurrent(
		"retries a failed snapshot thread without moving the runtime into recovery",
		async () => {
			const fixture = createSchedulerFixture({
				publish: async () => {
					throw new PartitionCheckpointThreadError({
						message: "thread exited",
					});
				},
			});
			try {
				fixture.initialize({ partition: 0 });
				const { lease, controller } = fixture.start({ partition: 0 });
				await fixture.clock.advance(100);
				expect(lease.getHealth()).toMatchObject({
					status: "degraded",
					failure: { name: "PartitionCheckpointThreadError", retriable: true },
				});
				expect(controller.signal.aborted).toBe(false);
				expect(fixture.failures).toEqual([]);
			} finally {
				fixture.close();
			}
		},
	);
});
