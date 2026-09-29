const MAX_CAUSE_DEPTH = 8;

/** The logger serializes an error's name/message/stack only; the recovery reason lives in `cause`. */
export function errorCauseChain({
	error,
}: {
	error: unknown;
}): { name: string; message: string }[] {
	const chain: { name: string; message: string }[] = [];
	const seen = new Set<unknown>([error]);
	let current = error instanceof Error ? nextCause(error) : undefined;
	while (current instanceof Error && !seen.has(current)) {
		if (chain.length >= MAX_CAUSE_DEPTH) break;
		seen.add(current);
		chain.push({ name: current.name, message: messageOf(current) });
		current = nextCause(current);
	}
	return chain;
}

/** An aggregate names no cause of its own; its first member is the one the chain follows. */
function nextCause(error: Error): unknown {
	if (error.cause !== undefined) return error.cause;
	if (error instanceof AggregateError) return error.errors[0];
	return undefined;
}

function messageOf(error: Error): string {
	if (!(error instanceof AggregateError) || error.errors.length < 2)
		return error.message;
	return `${error.message} (${error.errors.length} errors, first follows)`;
}
