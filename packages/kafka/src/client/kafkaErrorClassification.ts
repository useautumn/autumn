import {
	LIBRDKAFKA_ERROR_CODES,
	type LibrdkafkaErrorName,
} from "@autumn/librdkafka";

const NAME_BY_CODE = new Map<number, LibrdkafkaErrorName>();
for (const [name, code] of Object.entries(LIBRDKAFKA_ERROR_CODES))
	NAME_BY_CODE.set(code, name as LibrdkafkaErrorName);

type KafkaErrorFields = {
	code?: unknown;
	retriable?: unknown;
	isRetriable?: unknown;
	isFatal?: unknown;
	fatal?: unknown;
	cause?: unknown;
	abortCause?: unknown;
	errors?: unknown;
};

/** Every error reachable from `cause` through `cause`, `abortCause` and aggregated `errors`. */
export function* kafkaErrorChainOf(cause: unknown): Generator<object> {
	const pending = [cause];
	const seen = new Set<unknown>();
	while (pending.length > 0) {
		const current = pending.pop();
		if (current === null || typeof current !== "object" || seen.has(current))
			continue;
		seen.add(current);
		yield current;
		const fields = current as KafkaErrorFields;
		pending.push(fields.cause, fields.abortCause);
		if (Array.isArray(fields.errors)) pending.push(...fields.errors);
	}
}

/** The librdkafka error code an error carries: negative for client-side errors, the Kafka protocol code otherwise. */
export function kafkaErrorCodeOf(error: object): number | null {
	const code = (error as KafkaErrorFields).code;
	return typeof code === "number" && Number.isInteger(code) ? code : null;
}

/**
 * The Kafka protocol name of a broker refusal (`CONCURRENT_TRANSACTIONS`, `PRODUCER_FENCED`, …), the
 * name kafkajs put in `KafkaJSProtocolError.type`; null for client-side errors. Codes we never classify on
 * by name read as `KAFKA_ERROR_<code>`.
 */
export function kafkaProtocolErrorTypeOf(error: object): string | null {
	const code = kafkaErrorCodeOf(error);
	if (code === null || code <= 0) return null;
	const name = NAME_BY_CODE.get(code);
	return name ? name.replace(/^ERR_/, "") : `KAFKA_ERROR_${code}`;
}

/** A broker refusal anywhere in the chain; with `types`, only one of those. */
export function isKafkaProtocolError({
	cause,
	types,
}: {
	cause: unknown;
	types?: ReadonlySet<string>;
}): boolean {
	for (const error of kafkaErrorChainOf(cause)) {
		const type = kafkaProtocolErrorTypeOf(error);
		if (type !== null && (!types || types.has(type))) return true;
	}
	return false;
}

export function hasKafkaErrorCode({
	cause,
	codes,
}: {
	cause: unknown;
	codes: ReadonlySet<number>;
}): boolean {
	for (const error of kafkaErrorChainOf(cause)) {
		const code = kafkaErrorCodeOf(error);
		if (code !== null && codes.has(code)) return true;
	}
	return false;
}

/** librdkafka's own verdict that retrying may succeed: the nearest error in the chain that gives one. */
export function isRetriableKafkaError(cause: unknown): boolean {
	for (const error of kafkaErrorChainOf(cause)) {
		const fields = error as KafkaErrorFields;
		const verdict = fields.retriable ?? fields.isRetriable;
		if (typeof verdict === "boolean") return verdict;
	}
	return false;
}
