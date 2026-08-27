const retryableMessages = [
	"socket connection was closed unexpectedly",
	"connection reset",
	"fetch failed",
	"other side closed",
	"premature close",
	"terminated",
];

const RETRYABLE_ERROR_CODES = new Set(["UND_ERR_SOCKET"]);

const messageOf = (error: unknown) =>
	(error instanceof Error ? error.message : String(error)).toLowerCase();

const codeOf = (error: unknown) => {
	const code = (error as { code?: unknown } | undefined)?.code;
	return typeof code === "string" ? code : undefined;
};

/** Mirrors eve's own isStreamDisconnectError so every transport failure the SDK
 * gives up on still reaches callers as EveStreamDisconnectedError. */
export const isRetryableEveStreamError = (error: unknown) => {
	const code = codeOf(error);
	if (code && RETRYABLE_ERROR_CODES.has(code)) return true;
	const message = messageOf(error);
	return retryableMessages.some((candidate) => message.includes(candidate));
};

/** The request provably never reached the server, so a retry cannot
 * double-deliver anything. */
export const isConnectionRefusedError = (error: unknown) =>
	/unable to connect|connection ?refused|econnrefused/.test(messageOf(error));

/** Any transport-level failure — refused, reset, or dropped mid-flight.
 * Used to keep raw fetch internals out of user-facing error text. */
export const isTransientNetworkError = (error: unknown) =>
	isRetryableEveStreamError(error) ||
	isConnectionRefusedError(error) ||
	/econnreset/.test(messageOf(error));
