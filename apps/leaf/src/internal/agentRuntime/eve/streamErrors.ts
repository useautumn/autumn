const retryableMessages = [
	"socket connection was closed unexpectedly",
	"connection reset",
	"fetch failed",
	"other side closed",
	"terminated",
];

const messageOf = (error: unknown) =>
	(error instanceof Error ? error.message : String(error)).toLowerCase();

export const isRetryableEveStreamError = (error: unknown) => {
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
