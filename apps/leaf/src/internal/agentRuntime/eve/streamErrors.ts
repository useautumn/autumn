const retryableMessages = [
	"socket connection was closed unexpectedly",
	"connection reset",
	"fetch failed",
	"other side closed",
	"terminated",
];

export const isRetryableEveStreamError = (error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	return retryableMessages.some((candidate) =>
		message.toLowerCase().includes(candidate),
	);
};
