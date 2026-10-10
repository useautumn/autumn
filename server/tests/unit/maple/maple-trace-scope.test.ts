/**
 * Contract: billing, webhooks and state-changing calls reach Maple whole; reads
 * and the hot path only with scope `api`, sampled at the root but always kept
 * when the request failed or was slow.
 */

import { describe, expect, test } from "bun:test";
import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import type {
	ReadableSpan,
	SpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import {
	classifyMapleRequest,
	type MapleTraceMode,
	type MapleTraceScope,
} from "@/external/maple/mapleTraceScope.js";
import { MapleScopedSpanProcessor } from "@/utils/otel/MapleScopedSpanProcessor.js";

const TRACE = "a".repeat(32);
const ROOT = "0000000000000001";

const createSpan = ({
	spanId,
	durationMs = 5,
	statusCode = 200,
}: {
	spanId: string;
	durationMs?: number;
	statusCode?: number;
}): ReadableSpan =>
	({
		name: "span",
		kind: SpanKind.SERVER,
		attributes: { "http.response.status_code": statusCode },
		resource: {} as ReadableSpan["resource"],
		instrumentationScope: { name: "test" },
		status: { code: SpanStatusCode.UNSET },
		events: [],
		links: [],
		startTime: [0, 0],
		endTime: [0, 1],
		duration: [Math.floor(durationMs / 1000), (durationMs % 1000) * 1_000_000],
		ended: true,
		droppedAttributesCount: 0,
		droppedEventsCount: 0,
		droppedLinksCount: 0,
		spanContext: () => ({ traceId: TRACE, spanId, traceFlags: 1 }),
	}) as ReadableSpan;

class CapturingSpanProcessor implements SpanProcessor {
	readonly ended: string[] = [];
	onStart(): void {}
	onEnd(span: ReadableSpan): void {
		this.ended.push(span.spanContext().spanId);
	}
	forceFlush(): Promise<void> {
		return Promise.resolve();
	}
	shutdown(): Promise<void> {
		return Promise.resolve();
	}
}

const processorFor = ({
	mode,
	sampleRate,
}: {
	mode: MapleTraceMode;
	sampleRate: number;
}) => {
	const marks = new Map([[TRACE, { mode, rootSpanId: ROOT }]]);
	const delegate = new CapturingSpanProcessor();
	const processor = new MapleScopedSpanProcessor(delegate, {
		sampleRate,
		slowMs: 1000,
		marks: {
			get: (traceId) => marks.get(traceId),
			promote: (traceId) => {
				const mark = marks.get(traceId);
				if (mark) mark.mode = "keep";
			},
			unmark: (traceId) => {
				marks.delete(traceId);
			},
		},
	});
	return { processor, delegate };
};

describe("classifyMapleRequest", () => {
	const classify = (
		method: string,
		path: string,
		scope: MapleTraceScope = "writes",
	) => classifyMapleRequest({ method, path, scope });

	test("keeps billing, webhooks and state changes in the default scope", () => {
		for (const path of [
			"/v1/billing.attach",
			"/v1/checkout",
			"/v1/billing.preview_attach",
			"/v1/balances.create",
			"/v1/balances.update",
			"/v1/customers",
			"/v1/customers.update",
			"/v1/entities.delete",
			"/v1/invoices.finalize",
			"/webhooks/connect/live",
			"/webhooks/revenuecat/org_1/live",
		]) {
			expect(classify("POST", path)).toBe("keep");
		}
		expect(classify("DELETE", "/v1/customers/cus_1")).toBe("keep");
	});

	test("leaves reads and the hot path out unless the scope is api", () => {
		for (const [method, path] of [
			["POST", "/v1/balances.check"],
			["POST", "/v1/balances.track"],
			["POST", "/v1/customers.get"],
			["POST", "/v1/customers.list"],
			["POST", "/v1/check"],
			["POST", "/v1/track"],
			["GET", "/v1/customers/cus_1"],
		] as const) {
			expect(classify(method, path)).toBeNull();
			expect(classify(method, path, "api")).toBe("sample");
		}
	});

	test("billing scope matches the log tap only", () => {
		expect(classify("POST", "/v1/attach", "billing")).toBe("keep");
		expect(classify("POST", "/v1/customers.update", "billing")).toBeNull();
	});
});

describe("MapleScopedSpanProcessor", () => {
	test("forwards kept traces as spans end", () => {
		const { processor, delegate } = processorFor({
			mode: "keep",
			sampleRate: 0,
		});
		processor.onEnd(createSpan({ spanId: "0000000000000002" }));
		processor.onEnd(createSpan({ spanId: ROOT }));
		expect(delegate.ended).toEqual(["0000000000000002", ROOT]);
	});

	test("drops a sampled-out trace once its root ends", () => {
		const { processor, delegate } = processorFor({
			mode: "sample",
			sampleRate: 0,
		});
		processor.onEnd(createSpan({ spanId: "0000000000000002" }));
		processor.onEnd(createSpan({ spanId: ROOT }));
		processor.onEnd(createSpan({ spanId: "0000000000000003" }));
		expect(delegate.ended).toEqual([]);
	});

	test("keeps a sampled trace whose root failed or was slow, children first", () => {
		for (const root of [
			createSpan({ spanId: ROOT, statusCode: 503 }),
			createSpan({ spanId: ROOT, durationMs: 2500 }),
		]) {
			const { processor, delegate } = processorFor({
				mode: "sample",
				sampleRate: 0,
			});
			processor.onEnd(createSpan({ spanId: "0000000000000002" }));
			processor.onEnd(root);
			processor.onEnd(createSpan({ spanId: "0000000000000003" }));
			expect(delegate.ended).toEqual([
				"0000000000000002",
				ROOT,
				"0000000000000003",
			]);
		}
	});

	test("keeps a healthy sampled trace that falls in the rate", () => {
		const { processor, delegate } = processorFor({
			mode: "sample",
			sampleRate: 1,
		});
		processor.onEnd(createSpan({ spanId: ROOT }));
		expect(delegate.ended).toEqual([ROOT]);
	});
});
