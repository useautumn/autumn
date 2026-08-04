import { SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";

const tracer = trace.getTracer("autumn.dynamodb");

/** Client span around a DynamoDB operation — surfaces per-call latency and
 *  outcome in traces. The callback gets a setter for outcome attributes
 *  resolved during the call (e.g. claimed vs duplicate vs unavailable). */
export const withDynamoSpan = async <T>({
	name,
	attributes,
	fn,
}: {
	name: string;
	attributes?: Record<string, string | number>;
	fn: (
		setAttribute: (key: string, value: string | number) => void,
	) => Promise<T>;
}): Promise<T> =>
	tracer.startActiveSpan(
		`dynamodb.${name}`,
		{ kind: SpanKind.CLIENT },
		async (span) => {
			if (attributes) span.setAttributes(attributes);

			try {
				return await fn((key, value) => span.setAttribute(key, value));
			} catch (error) {
				span.recordException(error as Error);
				span.setStatus({ code: SpanStatusCode.ERROR });
				throw error;
			} finally {
				span.end();
			}
		},
	);
