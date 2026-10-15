/** kafkajs names a dropped or refused broker connection and a timed-out request this way. */
const RETRIABLE_ERROR_NAMES: ReadonlySet<string> = new Set([
	"KafkaJSConnectionError",
	"KafkaJSConnectionClosedError",
	"KafkaJSRequestTimeoutError",
]);

/** A leader move or a slow ack: the broker refused nothing for good. kafkajs gives the type, either client the code. */
const RETRIABLE_PROTOCOL_TYPES: ReadonlySet<string> = new Set([
	"LEADER_NOT_AVAILABLE",
	"NOT_LEADER_FOR_PARTITION",
	"NOT_LEADER_OR_FOLLOWER",
	"REQUEST_TIMED_OUT",
]);
const RETRIABLE_PROTOCOL_CODES: ReadonlySet<number> = new Set([5, 6, 7]);

const MAX_CAUSE_DEPTH = 5;

const isRetriableCause = (cause: object): boolean => {
	const { name, type, code } = cause as {
		name?: unknown;
		type?: unknown;
		code?: unknown;
	};
	return (
		(typeof name === "string" && RETRIABLE_ERROR_NAMES.has(name)) ||
		(typeof type === "string" && RETRIABLE_PROTOCOL_TYPES.has(type)) ||
		(typeof code === "number" && RETRIABLE_PROTOCOL_CODES.has(code))
	);
};

/** Whether a failed command-log append is worth sending again; kafkajs wraps the reason its retries ran out on as the cause. */
export const isRetriableAppendError = (error: unknown): boolean => {
	let cause: unknown = error;
	for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth++) {
		if (typeof cause !== "object" || cause === null) return false;
		if (isRetriableCause(cause)) return true;
		cause = (cause as { cause?: unknown }).cause;
	}
	return false;
};
