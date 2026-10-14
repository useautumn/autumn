import { OwnedPartitionNotReadyError } from "../../runtime/runtimeErrors.js";

export class PartitionRetiredError extends Error {
	constructor() {
		super("Partition retired");
		this.name = "PartitionRetiredError";
	}
}

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
