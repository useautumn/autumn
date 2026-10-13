import { type Context, SpanStatusCode } from "@opentelemetry/api";
import type {
	ReadableSpan,
	Span,
	SpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import {
	isInMapleSampleRate,
	MAPLE_TRACE_SAMPLE_RATE,
} from "@/external/maple/mapleSampling.js";
import {
	getMapleTraceMark,
	type MapleTraceMode,
	promoteMapleTrace,
	unmarkMapleTrace,
} from "@/external/maple/mapleTraceScope.js";
import { withAttributes } from "./SpanIngestCompactor.js";
import { TENANT_ATTR_KEYS } from "./tenantContext.js";

const MAX_BUFFERED_TRACES = 2_000;
const MAX_SPANS_PER_BUFFERED_TRACE = 256;

type TraceMarks = {
	get: (
		traceId: string,
	) =>
		| { mode: MapleTraceMode; rootSpanId: string; rootSpanIds?: Set<string> }
		| undefined;
	promote: (traceId: string) => void;
	unmark: (traceId: string) => void;
};

const defaultMarks: TraceMarks = {
	get: getMapleTraceMark,
	promote: promoteMapleTrace,
	unmark: unmarkMapleTrace,
};

const durationMs = (span: ReadableSpan) =>
	span.duration[0] * 1000 + span.duration[1] / 1_000_000;

const TOO_MANY_REQUESTS = 429;

// Denials and client errors are what investigations look for, so they are
// never sampled out. Rate limiting is the exception: it arrives as a storm.
const isAlwaysKeptRoot = (span: ReadableSpan) => {
	const status = Number(span.attributes["http.response.status_code"]);
	return (
		span.status.code === SpanStatusCode.ERROR ||
		(status >= 400 && status !== TOO_MANY_REQUESTS) ||
		span.attributes["check.allowed"] === false ||
		span.attributes["check.fail_open"] === true
	);
};

// Tenant attrs are copied onto every child span, where they are most of the
// span's size. The root carries them, so children are sent without.
const withoutTenantAttrs = (span: ReadableSpan): ReadableSpan => {
	const attributes = { ...span.attributes };
	for (const key of TENANT_ATTR_KEYS) delete attributes[key];
	return withAttributes({ span, attributes });
};

/**
 * Forwards spans of traces marked for Maple. `keep` traces pass straight
 * through; `sample` traces are held until their root ends, then kept if it
 * failed, was denied, was slow, or falls in the sample rate.
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
			sampleRate: MAPLE_TRACE_SAMPLE_RATE,
			slowMs: Number(process.env.MAPLE_TRACE_SLOW_MS) || 1000,
			marks: defaultMarks,
		},
	) {}

	onStart(_span: Span, _parentContext: Context): void {}

	onEnd(span: ReadableSpan): void {
		const { traceId, spanId } = span.spanContext();
		const mark = this.options.marks.get(traceId);
		if (!mark) return;

		// Every request or job span the trace was marked for can decide a
		// sampled trace.
		const isVerdictRoot =
			spanId === mark.rootSpanId || mark.rootSpanIds?.has(spanId) === true;
		// A request the scope leaves out can share the trace id. Its span has no
		// local parent either, so nothing above it carries its tenant attrs.
		const parent = span.parentSpanContext;
		const keepsTenantAttrs =
			isVerdictRoot || !parent?.spanId || parent.isRemote === true;
		const exported = keepsTenantAttrs ? span : withoutTenantAttrs(span);
		if (mark.mode === "keep") {
			// A trace promoted mid-flight still has spans waiting on a verdict.
			this.flush(traceId);
			this.delegate.onEnd(exported);
			return;
		}
		if (!isVerdictRoot) {
			this.buffer(traceId, exported);
			return;
		}

		const kept =
			isAlwaysKeptRoot(span) ||
			durationMs(span) >= this.options.slowMs ||
			isInMapleSampleRate({ traceId, sampleRate: this.options.sampleRate });
		if (kept) {
			// Spans that end after this root (async work, other roots) follow the same verdict.
			this.options.marks.promote(traceId);
			this.flush(traceId);
			this.delegate.onEnd(exported);
			return;
		}

		// Not kept on its own account. While another request of the trace is
		// still running it may yet be, so the verdict passes to that one.
		mark.rootSpanIds?.delete(spanId);
		const nextRootSpanId = mark.rootSpanIds?.values().next().value;
		if (nextRootSpanId === undefined) {
			this.buffers.delete(traceId);
			this.options.marks.unmark(traceId);
			return;
		}
		if (mark.rootSpanId === spanId) mark.rootSpanId = nextRootSpanId;
		this.buffer(traceId, exported);
	}

	private flush(traceId: string) {
		const buffered = this.buffers.get(traceId);
		if (!buffered) return;
		this.buffers.delete(traceId);
		for (const span of buffered) this.delegate.onEnd(span);
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
