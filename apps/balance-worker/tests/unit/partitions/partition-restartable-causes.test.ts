import { expect, test } from "bun:test";
import {
	KafkaBatchNotCommittedError,
	KafkaTransactionStateUnknownError,
} from "@autumn/kafka";
import { FlushBookmarkConflictError } from "@autumn/postgres";
import { FlushRecordFailedError } from "../../../src/committer/committerErrors.js";
import { StateAheadOfKafkaLogEndError } from "../../../src/kafka/meteringConsumer/meteringErrors.js";
import { isPartitionRestartableCause } from "../../../src/partitions/health/partitionRestartableCauses.js";
import {
	MutationBatchNotCommittedError,
	PartitionWriterRecoveryRequiredError,
} from "../../../src/processor/writer/writerErrors.js";
import {
	OwnedPartitionProducerFencedError,
	OwnedPartitionRecoveryRequiredError,
	PartitionPreparationFailedError,
} from "../../../src/runtime/runtimeErrors.js";

const topic = "events";
const partition = 44;

/** What librdkafka (through the producer) throws for a broker refusal: its code and its own retry verdict. */
function librdkafkaError({
	message,
	code,
	retriable,
}: {
	message: string;
	code: number;
	retriable: boolean;
}): Error {
	return Object.assign(new Error(message), { code, retriable });
}

function refusedByCoordinator(): Error {
	return librdkafkaError({
		message: "concurrent operation ongoing",
		code: 51,
		retriable: true,
	});
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
	const expired = librdkafkaError({
		message:
			"Producer attempted an operation with an old epoch. Either there is a newer producer with the same transactionalId, or the producer's transaction has been expired by the broker",
		code: 47,
		retriable: false,
	});
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

test("an append whose retries ran out in a leader election restarts the partition alone: the bootstrap replays whatever landed", () => {
	// librdkafka gives up once message.timeout.ms passes and reports the send as timed out.
	const election = librdkafkaError({
		message: "Local: Message timed out",
		code: -192,
		retriable: true,
	});
	const cause = new OwnedPartitionRecoveryRequiredError({
		topic,
		partition,
		cause: new PartitionWriterRecoveryRequiredError({
			cause: new KafkaTransactionStateUnknownError({
				failureStage: "commit",
				cause: election,
			}),
		}),
	});
	expect(isPartitionRestartableCause({ cause })).toBe(true);
});

test("a standby whose preparation failed restarts the partition alone: it holds no producer and wrote nothing", () => {
	const cause = new OwnedPartitionRecoveryRequiredError({
		topic,
		partition,
		cause: new PartitionPreparationFailedError({
			topic,
			partition,
			cause: new StateAheadOfKafkaLogEndError({
				topic,
				partition,
				storedNextOffset: 7n,
				logEndOffset: 5n,
			}),
		}),
	});
	expect(isPartitionRestartableCause({ cause })).toBe(true);
});

function coordinatorNotReady({
	type,
	code,
}: {
	type: string;
	code: number;
}): Error {
	// The shim wraps librdkafka's error; the refusal is on the cause.
	return new Error(`init_transactions failed: ${type}`, {
		cause: librdkafkaError({
			message: `coordinator not ready: ${type}`,
			code,
			retriable: true,
		}),
	});
}

test("a producer the coordinator could not yet initialise restarts the partition alone: it wrote nothing", () => {
	for (const refusal of [
		{ type: "COORDINATOR_LOAD_IN_PROGRESS", code: 14 },
		{ type: "COORDINATOR_NOT_AVAILABLE", code: 15 },
		{ type: "NOT_COORDINATOR", code: 16 },
	]) {
		const cause = new OwnedPartitionRecoveryRequiredError({
			topic,
			partition,
			cause: coordinatorNotReady(refusal),
		});
		expect(isPartitionRestartableCause({ cause })).toBe(true);
	}
});

test("any other refusal the broker gave up retrying still stops the service", () => {
	for (const refusal of [
		{ type: "UNKNOWN_SERVER_ERROR", code: -1 },
		{ type: "ALL_BROKERS_DOWN", code: -187 },
	]) {
		const cause = new OwnedPartitionRecoveryRequiredError({
			topic,
			partition,
			cause: coordinatorNotReady(refusal),
		});
		expect(isPartitionRestartableCause({ cause })).toBe(false);
	}
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
