/** Raw Errors JSON-serialize to {} in log payloads — always log the message. */
export const errorMessage = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);
