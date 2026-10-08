import type { ProducerError } from "../types/producerError.js";

const MAX_CAUSE_DEPTH = 4;
const VERDICTS = ["retriable", "isRetriable", "fatal", "abortable"] as const;

type ErrorFields = Error & {
	code?: unknown;
	cause?: unknown;
	abortCause?: unknown;
	errors?: unknown;
} & Partial<Record<(typeof VERDICTS)[number], unknown>>;

/** The error a producer threw, flattened to data the producer thread can send back. */
export function producerErrorOf({
	cause,
	depth = 0,
}: {
	cause: unknown;
	depth?: number;
}): ProducerError {
	if (!(cause instanceof Error))
		return { name: "Error", message: String(cause) };
	const fields = cause as ErrorFields;
	const error: ProducerError = { name: cause.name, message: cause.message };
	if (typeof fields.code === "number") error.code = fields.code;
	for (const verdict of VERDICTS) {
		const value = fields[verdict];
		if (typeof value === "boolean") error[verdict] = value;
	}
	if (depth >= MAX_CAUSE_DEPTH) return error;
	const next = depth + 1;
	if (fields.cause !== undefined && fields.cause !== cause)
		error.cause = producerErrorOf({ cause: fields.cause, depth: next });
	if (fields.abortCause !== undefined && fields.abortCause !== cause)
		error.abortCause = producerErrorOf({
			cause: fields.abortCause,
			depth: next,
		});
	if (Array.isArray(fields.errors)) {
		error.errors = [];
		for (const nested of fields.errors)
			error.errors.push(producerErrorOf({ cause: nested, depth: next }));
	}
	return error;
}
