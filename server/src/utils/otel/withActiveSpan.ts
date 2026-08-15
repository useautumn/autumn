import {
	type Attributes,
	type Span,
	SpanKind,
	SpanStatusCode,
	trace,
} from "@opentelemetry/api";

const tracer = trace.getTracer("autumn.application");

export const withActiveSpan = async <T>({
	name,
	attributes,
	kind = SpanKind.INTERNAL,
	fn,
}: {
	name: string;
	attributes?: Attributes;
	kind?: SpanKind;
	fn: (span: Span) => Promise<T>;
}): Promise<T> =>
	tracer.startActiveSpan(name, { attributes, kind }, async (span) => {
		try {
			const result = await fn(span);
			span.setStatus({ code: SpanStatusCode.OK });
			return result;
		} catch (error) {
			span.recordException(
				error instanceof Error ? error : new Error(String(error)),
			);
			span.setStatus({
				code: SpanStatusCode.ERROR,
				message: error instanceof Error ? error.message : String(error),
			});
			throw error;
		} finally {
			span.end();
		}
	});
