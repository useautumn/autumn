import { context, SpanStatusCode, trace } from "@opentelemetry/api";

const tracer = trace.getTracer("autumn");

/** Wraps an async function in an OTel span with automatic error recording. */
export const withSpan = <T>({
	name,
	attributes,
	fn,
}: {
	name: string;
	attributes: Record<string, any>;
	fn: () => Promise<T>;
}) => {
	const span = tracer.startSpan(name);
	span.setAttributes(attributes);

	return context.with(trace.setSpan(context.active(), span), async () => {
		try {
			const result = await fn();
			span.end();
			return result;
		} catch (err) {
			span.setStatus({ code: SpanStatusCode.ERROR });
			if (err instanceof Error) {
				span.recordException(err);
			}
			span.end();
			throw err;
		}
	});
};
