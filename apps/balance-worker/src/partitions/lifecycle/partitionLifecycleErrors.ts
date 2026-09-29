import { OwnedPartitionNotReadyError } from "../../runtime/runtimeErrors.js";

/** The roster took this partition away, or the worker is stopping: work waiting on it is let go. */
export class PartitionRetiredError extends Error {
	constructor() {
		super("Partition retired");
		this.name = "PartitionRetiredError";
	}
}

/** The roster gave the partition back before a successor took it: the hand-off is unwound and it keeps serving. */
export class PartitionHandoffCancelledError extends Error {
	constructor() {
		super("Partition handoff cancelled");
		this.name = "PartitionHandoffCancelledError";
	}
}

export type PartitionLifecycleEvent =
	| "retired"
	| "handoff_cancelled"
	| "draining";

/** A failure that is the partition lifecycle doing its job, not something wrong:
 *  a retirement letting waiting work go, a hand-off unwound, or a runtime that
 *  was draining when work reached it. Reported as information, not as an error. */
export function partitionLifecycleEventOf({
	cause,
}: {
	cause: unknown;
}): PartitionLifecycleEvent | null {
	const seen = new Set<unknown>();
	let current = cause;
	while (
		typeof current === "object" &&
		current !== null &&
		!seen.has(current)
	) {
		const event = lifecycleEventOfError(current);
		if (event) return event;
		seen.add(current);
		if (current instanceof AggregateError) {
			for (const member of current.errors) {
				const memberEvent = partitionLifecycleEventOf({ cause: member });
				if (memberEvent) return memberEvent;
			}
		}
		if (!("cause" in current)) return null;
		current = current.cause;
	}
	return null;
}

function lifecycleEventOfError(error: object): PartitionLifecycleEvent | null {
	if (error instanceof PartitionRetiredError) return "retired";
	if (error instanceof PartitionHandoffCancelledError)
		return "handoff_cancelled";
	if (
		error instanceof OwnedPartitionNotReadyError &&
		(error.status === "draining" || error.status === "stopped")
	)
		return "draining";
	return null;
}
