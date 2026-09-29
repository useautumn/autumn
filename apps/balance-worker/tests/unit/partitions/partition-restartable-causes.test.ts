import { expect, test } from "bun:test";
import {
	KafkaBatchNotCommittedError,
	KafkaTransactionStateUnknownError,
} from "@autumn/kafka";
import { FlushBookmarkConflictError } from "@autumn/postgres";
import { KafkaJSProtocolError } from "kafkajs";
import { FlushRecordFailedError } from "../../../src/committer/committerErrors.js";
import { isPartitionRestartableCause } from "../../../src/partitions/health/partitionRestartableCauses.js";
import {
	MutationBatchNotCommittedError,
	PartitionWriterRecoveryRequiredError,
} from "../../../src/processor/writer/writerErrors.js";
import {
	OwnedPartitionProducerFencedError,
	OwnedPartitionRecoveryRequiredError,
} from "../../../src/runtime/runtimeErrors.js";

const topic = "events";
const partition = 44;

function refusedByCoordinator(): Error {
	return new KafkaJSProtocolError(
		Object.assign(new Error("concurrent operation ongoing"), {
			type: "CONCURRENT_TRANSACTIONS",
			code: 51,
			retriable: true,
		}),
	);
}

test("a batch the broker refused, reported through recovery, restarts the partition alone", () => {
	const cause = new OwnedPartitionRecoveryRequiredError({
		topic,
		partition,
		cause: new PartitionWriterRecoveryRequiredError({
			cause: new MutationBatchNotCommittedError({
				cause: refusedByCoordinator(),
			}),
		}),
	});
	expect(isPartitionRestartableCause({ cause })).toBe(true);
});

test("a release the broker refused during retirement is the same verdict", () => {
	const cause = new AggregateError(
		[new KafkaBatchNotCommittedError({ cause: refusedByCoordinator() })],
		"Partition retirement did not settle safely",
	);
	expect(isPartitionRestartableCause({ cause })).toBe(true);
});

test("a bookmark the store would not advance restarts the partition alone", () => {
	const cause = new OwnedPartitionRecoveryRequiredError({
		topic,
		partition,
		cause: new PartitionWriterRecoveryRequiredError({
			cause: new FlushRecordFailedError({
				mutationId: "mut_1",
				cause: new FlushBookmarkConflictError({ expected: 1, advanced: 0 }),
			}),
		}),
	});
	expect(isPartitionRestartableCause({ cause })).toBe(true);
});

test("a producer the broker fenced restarts the partition alone: the log and the store decide what landed", () => {
	const expired = new KafkaJSProtocolError(
		Object.assign(
			new Error(
				"Producer attempted an operation with an old epoch. Either there is a newer producer with the same transactionalId, or the producer's transaction has been expired by the broker",
			),
			{ type: "INVALID_PRODUCER_EPOCH", code: 47, retriable: false },
		),
	);
	const cause = new OwnedPartitionProducerFencedError({
		topic,
		partition,
		cause: new PartitionWriterRecoveryRequiredError({
			cause: new KafkaTransactionStateUnknownError({
				failureStage: "commit",
				cause: expired,
			}),
		}),
	});
	expect(isPartitionRestartableCause({ cause })).toBe(true);
});

test("anything else keeps stopping the service", () => {
	const store = new OwnedPartitionRecoveryRequiredError({
		topic,
		partition,
		cause: new PartitionWriterRecoveryRequiredError({
			cause: new Error("relation partition_progress does not exist"),
		}),
	});
	expect(isPartitionRestartableCause({ cause: store })).toBe(false);
	expect(isPartitionRestartableCause({ cause: "not an error" })).toBe(false);
	const loop = new Error("a");
	loop.cause = loop;
	expect(isPartitionRestartableCause({ cause: loop })).toBe(false);
});

test("a refused batch reported alongside a failed cleanup still stops the service", () => {
	const cause = new AggregateError(
		[
			new KafkaBatchNotCommittedError({ cause: refusedByCoordinator() }),
			new Error("Producer session did not disconnect"),
		],
		"Owned partition recovery cleanup failed",
	);
	expect(isPartitionRestartableCause({ cause })).toBe(false);
	expect(
		isPartitionRestartableCause({ cause: new AggregateError([], "empty") }),
	).toBe(false);
});
