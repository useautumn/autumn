import { type Context, SpanStatusCode } from "@opentelemetry/api";
import type {
	ReadableSpan,
	Span,
	SpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { recordSpanDurationMetric } from "./spanMetrics.js";

const REDIS_SUCCESS_SAMPLE_RATE = Number.parseFloat(
	process.env.OTEL_REDIS_SUCCESS_SAMPLE_RATE ?? "0.01",
);

const normalizedRedisSuccessSampleRate = Number.isFinite(
	REDIS_SUCCESS_SAMPLE_RATE,
)
	? Math.min(Math.max(REDIS_SUCCESS_SAMPLE_RATE, 0), 1)
	: 0.01;

const hashStringToUnitInterval = (value: string): number => {
	let hash = 2166136261;
	for (let i = 0; i < value.length; i++) {
		hash ^= value.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}

	return (hash >>> 0) / 0xffffffff;
};

const isSuccessfulNonSlowRedisSpan = (span: ReadableSpan) =>
	span.name.startsWith("redis.") &&
	span.status.code === SpanStatusCode.OK &&
	span.attributes["db.redis.slow"] !== true;

const shouldDropSuccessfulRedisSpan = (span: ReadableSpan): boolean => {
	if (!isSuccessfulNonSlowRedisSpan(span)) return false;
	if (normalizedRedisSuccessSampleRate >= 1) return false;
	if (normalizedRedisSuccessSampleRate <= 0) return true;

	const spanContext = span.spanContext();
	const sampleKey = `${spanContext.traceId}:${spanContext.spanId}:${span.name}`;
	return (
		hashStringToUnitInterval(sampleKey) >= normalizedRedisSuccessSampleRate
	);
};

export class FilteringSpanProcessor implements SpanProcessor {
	constructor(private readonly delegate: SpanProcessor) {}

	onStart(span: Span, parentContext: Context): void {
		this.delegate.onStart(span, parentContext);
	}

	onEnd(span: ReadableSpan): void {
		recordSpanDurationMetric(span);

		if (shouldDropSuccessfulRedisSpan(span)) return;
		this.delegate.onEnd(span);
	}

	forceFlush(): Promise<void> {
		return this.delegate.forceFlush();
	}

	shutdown(): Promise<void> {
		return this.delegate.shutdown();
	}
}
