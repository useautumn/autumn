import type { ProducerError } from "../types/producerError.js";

/** The producer's error rebuilt on the decide thread: same name, code, verdicts and chain, so it classifies alike. */
export function kafkaErrorOf({ error }: { error: ProducerError }): Error {
	const rebuilt = new Error(error.message) as Error & Record<string, unknown>;
	Object.defineProperty(rebuilt, "name", {
		value: error.name,
		configurable: true,
	});
	if (error.code !== undefined) rebuilt.code = error.code;
	if (error.retriable !== undefined) rebuilt.retriable = error.retriable;
	if (error.isRetriable !== undefined) rebuilt.isRetriable = error.isRetriable;
	if (error.fatal !== undefined) rebuilt.fatal = error.fatal;
	if (error.abortable !== undefined) rebuilt.abortable = error.abortable;
	if (error.cause)
		Object.defineProperty(rebuilt, "cause", {
			value: kafkaErrorOf({ error: error.cause }),
			configurable: true,
		});
	if (error.abortCause)
		rebuilt.abortCause = kafkaErrorOf({ error: error.abortCause });
	if (error.errors) {
		const errors: Error[] = [];
		for (const nested of error.errors)
			errors.push(kafkaErrorOf({ error: nested }));
		rebuilt.errors = errors;
	}
	return rebuilt;
}
