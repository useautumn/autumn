import type { Context as OtelContext } from "@opentelemetry/api";
import type {
	ReadableSpan,
	Span,
	SpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { getTenantAttrs } from "./tenantContext.js";

export class TenantAttrSpanProcessor implements SpanProcessor {
	onStart(span: Span, parentContext: OtelContext): void {
		const attrs = getTenantAttrs(parentContext);
		if (!attrs) return;

		for (const [key, value] of Object.entries(attrs)) {
			if (value === undefined) continue;
			span.setAttribute(key, value);
		}
	}

	onEnd(_span: ReadableSpan): void {}

	shutdown(): Promise<void> {
		return Promise.resolve();
	}

	forceFlush(): Promise<void> {
		return Promise.resolve();
	}
}
