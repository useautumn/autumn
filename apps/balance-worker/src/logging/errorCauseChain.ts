const MAX_CAUSE_DEPTH = 8;

/** The logger serializes an error's name/message/stack only; the recovery reason lives in `cause`. */
export function errorCauseChain({
	error,
}: {
	error: unknown;
}): { name: string; message: string }[] {
	const chain: { name: string; message: string }[] = [];
	const seen = new Set<unknown>([error]);
	let current = error instanceof Error ? error.cause : undefined;
	while (current instanceof Error && !seen.has(current)) {
		if (chain.length >= MAX_CAUSE_DEPTH) break;
		seen.add(current);
		chain.push({ name: current.name, message: current.message });
		current = current.cause;
	}
	return chain;
}
