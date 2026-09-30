import { KafkaBatchNotCommittedError } from "@autumn/kafka";
import { FlushBookmarkConflictError } from "@autumn/postgres";
import { MutationBatchNotCommittedError } from "../../processor/writer/writerErrors.js";
import {
	OwnedPartitionProducerFencedError,
	PartitionPreparationFailedError,
} from "../../runtime/runtimeErrors.js";

/** A partition whose memory is merely behind the log and the store is rebuilt
 *  by a fresh bootstrap, and says nothing about the other partitions this
 *  worker serves. Two failures are exactly that. A batch the broker refused
 *  never reached the log, so nothing was acknowledged on its strength and the
 *  bootstrap picks up where the log ends. A bookmark the store would not
 *  advance means the store already holds those offsets, written by a successor
 *  or by this worker's own earlier flush, and the records this runtime was
 *  about to land are still in the log for the bootstrap to replay. A producer
 *  the broker fenced is the third: whether a newer producer took the
 *  transactional id or the coordinator expired a transaction a stalled thread
 *  left open, this runtime's word on what landed is gone, and a fresh bootstrap
 *  reads the answer from the log and the store. A standby preparation that
 *  failed is the fourth: it holds no producer and wrote nothing. Restarting
 *  goes through the ownership claim, so a partition another worker now holds
 *  is not taken back.
 *  Stopping the whole service instead, as it did before, turned one stalled
 *  partition into an exit that took the worker's healthy partitions with it. */
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
		// Several failures reported together are only as safe as the least safe of
		// them: a refused batch alongside a cleanup that failed is not a partition
		// that merely fell behind, and stops the worker as it always did.
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

function isRestartableError(error: object): boolean {
	return (
		error instanceof MutationBatchNotCommittedError ||
		error instanceof KafkaBatchNotCommittedError ||
		error instanceof FlushBookmarkConflictError ||
		error instanceof OwnedPartitionProducerFencedError ||
		error instanceof PartitionPreparationFailedError
	);
}
