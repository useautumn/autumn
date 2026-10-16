import type { Context } from "@opentelemetry/api";
import type {
	ReadableSpan,
	Span,
	SpanProcessor,
} from "@opentelemetry/sdk-trace-base";

/**
 * Lets several exporters share one FilteringSpanProcessor, so span metrics are
 * recorded and drizzle spans compacted once rather than once per exporter.
 */
export class FanoutSpanProcessor implements SpanProcessor {
	constructor(private readonly delegates: SpanProcessor[]) {}

	onStart(span: Span, parentContext: Context): void {
		for (const delegate of this.delegates)
			delegate.onStart(span, parentContext);
	}

	onEnd(span: ReadableSpan): void {
		for (const delegate of this.delegates) delegate.onEnd(span);
	}

	async forceFlush(): Promise<void> {
		await Promise.all(this.delegates.map((delegate) => delegate.forceFlush()));
	}

	async shutdown(): Promise<void> {
		await Promise.all(this.delegates.map((delegate) => delegate.shutdown()));
	}
}
