/** librdkafka's local failures for a send it gave up on while brokers were unreachable or slow: the record may
 *  still land, and the worker dedupes a resend by command id. */
const RETRIABLE_LOCAL_CODES: ReadonlySet<number> = new Set([
	-192, // _MSG_TIMED_OUT
	-195, // _TRANSPORT
	-187, // _ALL_BROKERS_DOWN
	-185, // _TIMED_OUT
]);

/** A leader move or a slow ack: the broker refused nothing for good. */
const RETRIABLE_PROTOCOL_CODES: ReadonlySet<number> = new Set([5, 6, 7]);

/** Sends @autumn/kafka ends as fate-unknown: a lost delivery report, or a batch only part of which landed. */
const RETRIABLE_ERROR_NAMES: ReadonlySet<string> = new Set([
	"KafkaDeliveryReportOverdueError",
	"KafkaPartialDeliveryError",
]);

const MAX_CAUSE_DEPTH = 5;

const isRetriableCause = (cause: object): boolean => {
	const { name, code } = cause as { name?: unknown; code?: unknown };
	return (
		(typeof name === "string" && RETRIABLE_ERROR_NAMES.has(name)) ||
		(typeof code === "number" &&
			(RETRIABLE_PROTOCOL_CODES.has(code) || RETRIABLE_LOCAL_CODES.has(code)))
	);
};

/** Whether a failed command-log append is worth sending again, judged on the error or any cause under it. */
export const isRetriableAppendError = (error: unknown): boolean => {
	let cause: unknown = error;
	for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth++) {
		if (typeof cause !== "object" || cause === null) return false;
		if (isRetriableCause(cause)) return true;
		cause = (cause as { cause?: unknown }).cause;
	}
	return false;
};
