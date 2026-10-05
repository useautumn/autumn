import { KafkaJSProtocolError } from "kafkajs";
import type { ProducerError } from "../types/producerError.js";

const MAX_CAUSE_DEPTH = 4;

/** The kafkajs error a producer threw, flattened to data the producer thread can send back. */
export const producerErrorOf = ({
	cause,
	depth = 0,
}: {
	cause: unknown;
	depth?: number;
}): ProducerError => {
	if (!(cause instanceof Error))
		return {
			kind: "other",
			name: "Error",
			message: String(cause),
			retriable: false,
		};
	const fields = cause as Error & {
		type?: unknown;
		code?: unknown;
		retriable?: unknown;
		cause?: unknown;
		errors?: unknown;
	};
	const error: ProducerError = {
		kind: cause instanceof KafkaJSProtocolError ? "protocol" : "other",
		name: cause.name,
		message: cause.message,
		retriable: fields.retriable === true,
	};
	if (typeof fields.type === "string") error.type = fields.type;
	if (typeof fields.code === "number") error.code = fields.code;
	if (depth >= MAX_CAUSE_DEPTH) return error;
	if (fields.cause !== undefined && fields.cause !== cause)
		error.cause = producerErrorOf({ cause: fields.cause, depth: depth + 1 });
	if (Array.isArray(fields.errors))
		error.errors = fields.errors.map((nested) =>
			producerErrorOf({ cause: nested, depth: depth + 1 }),
		);
	return error;
};
