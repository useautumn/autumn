/** Deepest cause first — that is where zod's issue list lives, and repair
 * feedback must not lose it to truncation behind a huge value dump. */
export const generationErrorMessage = (error: unknown): string => {
	if (!(error instanceof Error)) return String(error);
	const parts = [error.message];
	let cause: unknown = error.cause;
	for (let depth = 0; cause instanceof Error && depth < 3; depth++) {
		parts.push(cause.message);
		cause = cause.cause;
	}
	return parts.reverse().join(" — ").slice(0, 3000);
};
