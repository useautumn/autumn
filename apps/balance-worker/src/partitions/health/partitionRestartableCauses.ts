import {
	KafkaBatchNotCommittedError,
	KafkaTransactionStateUnknownError,
} from "@autumn/kafka";
import { FlushBookmarkConflictError } from "@autumn/postgres";
import { KafkaJSProtocolError } from "kafkajs";
import { MutationBatchNotCommittedError } from "../../processor/writer/writerErrors.js";
import {
	OwnedPartitionProducerFencedError,
	PartitionPreparationFailedError,
} from "../../runtime/runtimeErrors.js";

export function isPartitionRestartableCause({
	cause,
}: {
	cause: unknown;
}): boolean {
	const seen = new Set<unknown>();
	let current = cause;
	while (
		typeof current === "object" &&
		current !== null &&
		!seen.has(current)
	) {
		if (isRestartableError(current)) return true;
		seen.add(current);
		if (current instanceof AggregateError) {
			if (current.errors.length === 0) return false;
			return current.errors.every(isRestartableMember);
		}
		if (!("cause" in current)) return false;
		current = current.cause;
	}
	return false;
}

function isRestartableMember(member: unknown): boolean {
	return isPartitionRestartableCause({ cause: member });
}

const COORDINATOR_NOT_READY_TYPES = new Set([
	"COORDINATOR_LOAD_IN_PROGRESS",
	"COORDINATOR_NOT_AVAILABLE",
	"NOT_COORDINATOR",
]);

function isCoordinatorNotReady(error: object): boolean {
	return (
		error instanceof KafkaJSProtocolError &&
		COORDINATOR_NOT_READY_TYPES.has(error.type)
	);
}

function isRestartableError(error: object): boolean {
	return (
		isCoordinatorNotReady(error) ||
		error instanceof MutationBatchNotCommittedError ||
		error instanceof KafkaBatchNotCommittedError ||
		error instanceof KafkaTransactionStateUnknownError ||
		error instanceof FlushBookmarkConflictError ||
		error instanceof OwnedPartitionProducerFencedError ||
		error instanceof PartitionPreparationFailedError
	);
}
