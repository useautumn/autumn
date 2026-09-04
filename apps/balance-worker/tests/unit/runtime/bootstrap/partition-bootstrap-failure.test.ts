import { describe, expect, test } from "bun:test";
import {
	InvalidPartitionCheckpointError,
	PartitionCheckpointContentHashMismatchError,
	UnsupportedPartitionCheckpointSchemaVersionError,
} from "../../../../src/checkpoint/partitionCheckpoint.js";
import { PartitionCheckpointSourceError } from "../../../../src/checkpoint/partitionCheckpointSource.js";
import { PartitionBootstrapRefusedError } from "../../../../src/runtime/bootstrap/partitionBootstrap.js";
import { isPartitionBootstrapBlockedCause } from "../../../../src/runtime/bootstrap/partitionBootstrapFailure.js";
import {
	PartitionCheckpointLimitExceededError,
	PartitionCheckpointRestoreConflictError,
} from "../../../../src/state/checkpoint/restorePartitionCheckpoint.js";

const topic = "metering-events-v1";
const partition = 2;

describe("partition bootstrap failure policy", () => {
	test.each([
		new PartitionBootstrapRefusedError({
			topic,
			partition,
			reason: "checkpoint_required_for_retention_gap",
		}),
		new PartitionCheckpointSourceError({
			message: "checkpoint source unavailable",
			retriable: true,
		}),
		new InvalidPartitionCheckpointError({ message: "invalid checkpoint" }),
		new UnsupportedPartitionCheckpointSchemaVersionError({ schemaVersion: 2 }),
		new PartitionCheckpointContentHashMismatchError(),
		new PartitionCheckpointLimitExceededError({
			limitName: "serialized_bytes",
			limit: 100,
			observed: 101,
		}),
	])("parks expected bootstrap failure %#", (cause) => {
		expect(
			isPartitionBootstrapBlockedCause({
				cause: new Error("owned partition recovery", { cause }),
			}),
		).toBe(true);
	});

	test("leaves the group for node-local and combined cleanup failures", () => {
		const restoreConflict = new PartitionCheckpointRestoreConflictError({
			topic,
			partition,
			mode: "restore",
		});
		const cleanupFailure = new AggregateError(
			[
				new PartitionBootstrapRefusedError({
					topic,
					partition,
					reason: "checkpoint_required_for_retention_gap",
				}),
				new Error("producer cleanup failed"),
			],
			"recovery cleanup failed",
		);

		expect(isPartitionBootstrapBlockedCause({ cause: restoreConflict })).toBe(
			false,
		);
		expect(isPartitionBootstrapBlockedCause({ cause: cleanupFailure })).toBe(
			false,
		);
	});
});
