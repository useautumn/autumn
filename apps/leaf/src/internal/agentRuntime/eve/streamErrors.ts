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

export const isRetryableEveStreamError = (error: unknown) => {
	const code = codeOf(error);
	if (code && RETRYABLE_ERROR_CODES.has(code)) return true;
	const message = messageOf(error);
	return retryableMessages.some((candidate) => message.includes(candidate));
};

export const isConnectionRefusedError = (error: unknown) =>
	/unable to connect|connection ?refused|econnrefused/.test(messageOf(error));

export const isTransientNetworkError = (error: unknown) =>
	isRetryableEveStreamError(error) ||
	isConnectionRefusedError(error) ||
	/econnreset/.test(messageOf(error));
