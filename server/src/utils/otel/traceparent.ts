import type { SpanContext } from "@opentelemetry/api";

const TRACEPARENT_PATTERN = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

/** W3C `traceparent` for a span. Built by hand: the global propagator only exists once the SDK has started. */
export const formatTraceparent = ({
	spanContext,
}: {
	spanContext: SpanContext;
}) => {
	const { traceId, spanId, traceFlags } = spanContext;
	return `00-${traceId}-${spanId}-${traceFlags.toString(16).padStart(2, "0")}`;
};

/** The remote span a `traceparent` names; undefined when absent or malformed. */
export const parseTraceparent = ({
	traceparent,
}: {
	traceparent?: string;
}): SpanContext | undefined => {
	// Read from a message body, so nothing about its type is known.
	if (typeof traceparent !== "string") return undefined;
	const match = traceparent.match(TRACEPARENT_PATTERN);
	if (!match) return undefined;

	const [, traceId, spanId, flags] = match;
	if (/^0+$/.test(traceId) || /^0+$/.test(spanId)) return undefined;
	return {
		traceId,
		spanId,
		traceFlags: Number.parseInt(flags, 16),
		isRemote: true,
	};
};
