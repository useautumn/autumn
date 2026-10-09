import type { Context } from "@opentelemetry/api";
import type {
	ReadableSpan,
	Span,
	SpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { isTraceMarkedForMaple } from "@/external/maple/mapleTraceScope.js";

/** Forwards only spans whose trace was marked by mapleTraceScopeMiddleware. */
export class MapleScopedSpanProcessor implements SpanProcessor {
	constructor(
		private readonly delegate: SpanProcessor,
		private readonly isMarked: (
			traceId: string,
		) => boolean = isTraceMarkedForMaple,
	) {}

	onStart(_span: Span, _parentContext: Context): void {}

	onEnd(span: ReadableSpan): void {
		if (!this.isMarked(span.spanContext().traceId)) return;
		this.delegate.onEnd(span);
	}

	forceFlush(): Promise<void> {
		return this.delegate.forceFlush();
	}

	shutdown(): Promise<void> {
		return this.delegate.shutdown();
	}
}
