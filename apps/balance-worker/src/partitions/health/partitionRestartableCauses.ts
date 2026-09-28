import { KafkaBatchNotCommittedError } from "@autumn/kafka";
import { FlushBookmarkConflictError } from "@autumn/postgres";
import { MutationBatchNotCommittedError } from "../../processor/writer/writerErrors.js";

/** A partition whose memory is merely behind the log and the store is rebuilt
 *  by a fresh bootstrap, and says nothing about the other partitions this
 *  worker serves. Two failures are exactly that. A batch the broker refused
 *  never reached the log, so nothing was acknowledged on its strength and the
 *  bootstrap picks up where the log ends. A bookmark the store would not
 *  advance means the store already holds those offsets, written by a successor
 *  or by this worker's own earlier flush, and the records this runtime was
 *  about to land are still in the log for the bootstrap to replay. */
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
			for (const member of current.errors)
				if (isPartitionRestartableCause({ cause: member })) return true;
		}
		if (!("cause" in current)) return false;
		current = current.cause;
	}
	return false;
}

function isRestartableError(error: object): boolean {
	return (
		error instanceof MutationBatchNotCommittedError ||
		error instanceof KafkaBatchNotCommittedError ||
		error instanceof FlushBookmarkConflictError
	);
}
