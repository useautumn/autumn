import { PartitionProcessorStateNotFoundError } from "../common/processorErrors.js";

// One extra hydration: a second evict inside the same request is not worth a third Postgres read of a state that may be very large.
const MAX_ATTEMPTS = 2;

/**
 * Runs `attempt` against a resident subject, hydrating again when the rows
 * vanished between `ensure` and the read or the decision.
 *
 * An evict may land at any moment: a stale billing plan drops the customer,
 * an invalidation arrives from the API, the map's byte bound expires a row.
 * The eviction contract is that the next command re-reads Postgres, and the
 * command that finds the rows gone *is* the next command. Answering it
 * NOT_INITIALIZED instead turned one evict on a busy customer into a burst
 * of 409s for every reader in flight, and a hot customer can be evicted
 * repeatedly. `attempt` may return `null` (nothing to read) or throw
 * `PartitionProcessorStateNotFoundError` (the decision found no state);
 * either way the subject is ensured again and `attempt` re-run once
 * before the error reaches the caller.
 */
export async function withResidentSubject<Result>({
	ensure,
	attempt,
	customerKey,
	onRetry,
}: {
	ensure(): Promise<void>;
	attempt(): Promise<Result | null> | Result | null;
	customerKey: string;
	onRetry?(params: { attempt: number }): void;
}): Promise<Result> {
	for (let attemptNumber = 1; attemptNumber <= MAX_ATTEMPTS; attemptNumber++) {
		await ensure();
		let result: Result | null;
		try {
			result = await attempt();
		} catch (cause) {
			if (!(cause instanceof PartitionProcessorStateNotFoundError)) throw cause;
			result = null;
		}
		if (result !== null) return result;
		if (attemptNumber < MAX_ATTEMPTS) onRetry?.({ attempt: attemptNumber });
	}
	throw new PartitionProcessorStateNotFoundError({ customerKey });
}
