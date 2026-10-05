import {
	KafkaJSError,
	KafkaJSNumberOfRetriesExceeded,
	KafkaJSProtocolError,
} from "kafkajs";
import type { ProducerError } from "../types/producerError.js";

/**
 * The error the writer's split expects: a `KafkaJSProtocolError` when the broker refused (nothing appended),
 * a `KafkaJSError` for everything whose fate is unknown. The original name stays readable in logs.
 */
export const kafkaErrorOf = ({ error }: { error: ProducerError }): Error => {
	const cause = error.cause ? kafkaErrorOf({ error: error.cause }) : undefined;
	let rebuilt: Error & { type?: string; code?: number; errors?: Error[] };
	if (error.kind === "protocol") {
		rebuilt = new KafkaJSProtocolError(
			Object.assign(new Error(error.message), {
				type: error.type,
				code: error.code,
				retriable: error.retriable,
			}),
		);
	} else {
		rebuilt =
			error.name === "KafkaJSNumberOfRetriesExceeded" && cause
				? new KafkaJSNumberOfRetriesExceeded(cause, {
						retryCount: 0,
						retryTime: 0,
					})
				: new KafkaJSError(error.message, { retriable: error.retriable });
		if (error.type !== undefined) rebuilt.type = error.type;
		if (error.code !== undefined) rebuilt.code = error.code;
	}
	Object.defineProperty(rebuilt, "name", {
		value: error.name,
		configurable: true,
	});
	if (cause)
		Object.defineProperty(rebuilt, "cause", {
			value: cause,
			configurable: true,
		});
	if (error.errors)
		rebuilt.errors = error.errors.map((nested) =>
			kafkaErrorOf({ error: nested }),
		);
	return rebuilt;
};
