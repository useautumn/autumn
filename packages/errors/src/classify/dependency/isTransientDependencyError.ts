const TRANSIENT_NETWORK_CODES = new Set([
	"ECONNRESET",
	"ECONNREFUSED",
	"ETIMEDOUT",
	"EPIPE",
	"ENOTFOUND",
	"EAI_AGAIN",
	"ConnectionRefused",
	"ConnectionClosed",
	"FailedToOpenSocket",
	"UND_ERR_SOCKET",
	"UND_ERR_CONNECT_TIMEOUT",
]);

const TRANSIENT_POSTGRES_CODES = new Set([
	"CONNECTION_CLOSED",
	"CONNECTION_ENDED",
	"CONNECTION_DESTROYED",
	"CONNECT_TIMEOUT",
	"25P03",
	"57014",
	"57P01",
	"57P02",
	"57P03",
]);
const TRANSIENT_SQLSTATE_CLASSES = ["08", "53"];

const AWS_THROTTLING_NAMES = new Set([
	"ThrottlingException",
	"Throttling",
	"RequestThrottled",
	"RequestLimitExceeded",
	"TooManyRequestsException",
	"ServiceUnavailable",
]);

const isRetryableStatus = (status: unknown) =>
	typeof status === "number" && (status === 429 || status >= 500);

const isTransientNetworkError = (error: Error) => {
	if (error.name.startsWith("KafkaJS"))
		return !("retriable" in error && error.retriable === false);
	return (
		error.name === "TimeoutError" ||
		("code" in error && TRANSIENT_NETWORK_CODES.has(String(error.code)))
	);
};

/** A server-sent Postgres error carries `severity`; only those codes are SQLSTATEs. */
const isTransientPostgresError = (error: Error) => {
	if (!("code" in error)) return false;
	const code = String(error.code);
	if (TRANSIENT_POSTGRES_CODES.has(code)) return true;
	return (
		"severity" in error &&
		TRANSIENT_SQLSTATE_CLASSES.some((sqlClass) => code.startsWith(sqlClass))
	);
};

const isTransientAwsError = (error: Error) => {
	if (!("$metadata" in error)) return false;
	const metadata = error.$metadata as { httpStatusCode?: number } | undefined;
	return (
		AWS_THROTTLING_NAMES.has(error.name) ||
		isRetryableStatus(metadata?.httpStatusCode)
	);
};

const isTransientTinybirdError = (error: Error) =>
	error.name === "TinybirdError" &&
	"statusCode" in error &&
	isRetryableStatus(error.statusCode);

const MAX_CAUSE_DEPTH = 3;

export const isTransientDependencyError = ({
	error,
}: {
	error: Error;
}): boolean => {
	let current: unknown = error;
	for (let depth = 0; depth <= MAX_CAUSE_DEPTH; depth++) {
		if (!(current instanceof Error)) return false;
		if (
			isTransientNetworkError(current) ||
			isTransientPostgresError(current) ||
			isTransientAwsError(current) ||
			isTransientTinybirdError(current)
		) {
			return true;
		}
		current = current.cause;
	}
	return false;
};
