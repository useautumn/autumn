/**
 * A producer failure crosses the lane as data. The worker flattens the kafkajs error it caught; the main
 * thread rebuilds the one class the writer's error split tests for (`KafkaJSProtocolError`: the broker
 * refused, so nothing was appended) and a `KafkaJSError` for everything else, whose fate is unknown.
 * Types and codes ride along the whole cause chain so fencing detection keeps working.
 */
import { KafkaJSError, KafkaJSProtocolError } from "kafkajs";
import type { LaneError } from "./laneProtocol.js";

const MAX_CAUSE_DEPTH = 4;

export function laneErrorOf({
	cause,
	depth = 0,
}: {
	cause: unknown;
	depth?: number;
}): LaneError {
	if (!(cause instanceof Error)) {
		return {
			kind: "other",
			name: "Error",
			message: String(cause),
			retriable: false,
		};
	}
	const fields = cause as Error & {
		type?: unknown;
		code?: unknown;
		retriable?: unknown;
		cause?: unknown;
		errors?: unknown;
	};
	const error: LaneError = {
		kind: cause instanceof KafkaJSProtocolError ? "protocol" : "other",
		name: cause.name,
		message: cause.message,
		retriable: fields.retriable === true,
	};
	if (typeof fields.type === "string") error.type = fields.type;
	if (typeof fields.code === "number") error.code = fields.code;
	if (depth >= MAX_CAUSE_DEPTH) return error;
	if (fields.cause !== undefined && fields.cause !== cause)
		error.cause = laneErrorOf({ cause: fields.cause, depth: depth + 1 });
	if (Array.isArray(fields.errors))
		error.errors = fields.errors.map((nested) =>
			laneErrorOf({ cause: nested, depth: depth + 1 }),
		);
	return error;
}

export function laneErrorToKafkaError({ error }: { error: LaneError }): Error {
	const cause = error.cause
		? laneErrorToKafkaError({ error: error.cause })
		: undefined;
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
		rebuilt = new KafkaJSError(error.message, { retriable: error.retriable });
		if (error.type !== undefined) rebuilt.type = error.type;
		if (error.code !== undefined) rebuilt.code = error.code;
	}
	// The original name stays readable in logs; the class is what the callers branch on.
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
			laneErrorToKafkaError({ error: nested }),
		);
	return rebuilt;
}
