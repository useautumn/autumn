import { type Context, SpanStatusCode } from "@opentelemetry/api";
import type {
	ReadableSpan,
	Span,
	SpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import {
	getMapleTraceMark,
	type MapleTraceMode,
	promoteMapleTrace,
	unmarkMapleTrace,
} from "@/external/maple/mapleTraceScope.js";

const MAX_BUFFERED_TRACES = 2_000;
const MAX_SPANS_PER_BUFFERED_TRACE = 256;

const parseRate = (value: string | undefined, fallback: number) => {
	const rate = Number.parseFloat(value ?? "");
	return Number.isFinite(rate) ? Math.min(Math.max(rate, 0), 1) : fallback;
};

type TraceMarks = {
	get: (
		traceId: string,
	) => { mode: MapleTraceMode; rootSpanId: string } | undefined;
	promote: (traceId: string) => void;
	unmark: (traceId: string) => void;
};

const defaultMarks: TraceMarks = {
	get: getMapleTraceMark,
	promote: promoteMapleTrace,
	unmark: unmarkMapleTrace,
};

const hashToUnitInterval = (value: string) => {
	let hash = 2166136261;
	for (let i = 0; i < value.length; i++) {
		hash ^= value.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0) / 0xffffffff;
};

const durationMs = (span: ReadableSpan) =>
	span.duration[0] * 1000 + span.duration[1] / 1_000_000;

const isFailedRoot = (span: ReadableSpan) => {
	const status = Number(span.attributes["http.response.status_code"]);
	return span.status.code === SpanStatusCode.ERROR || status >= 500;
};

/**
 * Forwards spans of traces marked by mapleTraceScopeMiddleware. `keep` traces
 * pass straight through; `sample` traces are held until their root ends, then
 * kept if it failed, was slow, or falls in the sample rate.
 */
export class MapleScopedSpanProcessor implements SpanProcessor {
	private readonly buffers = new Map<string, ReadableSpan[]>();

	constructor(
		private readonly delegate: SpanProcessor,
		private readonly options: {
			sampleRate: number;
			slowMs: number;
			marks: TraceMarks;
		} = {
			sampleRate: parseRate(process.env.MAPLE_TRACE_SAMPLE_RATE, 0.1),
			slowMs: Number(process.env.MAPLE_TRACE_SLOW_MS) || 1000,
			marks: defaultMarks,
		},
	) {}

	onStart(_span: Span, _parentContext: Context): void {}

	onEnd(span: ReadableSpan): void {
		const { traceId, spanId } = span.spanContext();
		const mark = this.options.marks.get(traceId);
		if (!mark) return;
		if (mark.mode === "keep") {
			this.delegate.onEnd(span);
			return;
		}
		if (spanId !== mark.rootSpanId) {
			this.buffer(traceId, span);
			return;
		}

		const buffered = this.buffers.get(traceId) ?? [];
		this.buffers.delete(traceId);
		const kept =
			isFailedRoot(span) ||
			durationMs(span) >= this.options.slowMs ||
			hashToUnitInterval(traceId) < this.options.sampleRate;
		if (!kept) {
			this.options.marks.unmark(traceId);
			return;
		}
		// Spans that end after the root (async work) follow the same verdict.
		this.options.marks.promote(traceId);
		for (const child of buffered) this.delegate.onEnd(child);
		this.delegate.onEnd(span);
	}

	private buffer(traceId: string, span: ReadableSpan) {
		const spans = this.buffers.get(traceId);
		if (spans) {
			if (spans.length < MAX_SPANS_PER_BUFFERED_TRACE) spans.push(span);
			return;
		}
		if (this.buffers.size >= MAX_BUFFERED_TRACES) {
			const oldest = this.buffers.keys().next().value;
			if (oldest !== undefined) this.buffers.delete(oldest);
		}
		this.buffers.set(traceId, [span]);
	}

	forceFlush(): Promise<void> {
		return this.delegate.forceFlush();
	}

	shutdown(): Promise<void> {
		this.buffers.clear();
		return this.delegate.shutdown();
	}
}
