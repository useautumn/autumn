import { context, trace } from "@opentelemetry/api";

const tracer = trace.getTracer("express");

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
		const result = await fn();
		span.end();
		return result;
	});
};
