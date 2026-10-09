/**
 * Contract: Maple receives spans only from traces of billing requests and
 * Stripe webhooks, matching the log tap, and marks stay bounded.
 */

import { describe, expect, test } from "bun:test";
import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import type {
	ReadableSpan,
	SpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import {
	isMapleScopedRequest,
	isTraceMarkedForMaple,
	markTraceForMaple,
} from "@/external/maple/mapleTraceScope.js";
import { FanoutSpanProcessor } from "@/utils/otel/FanoutSpanProcessor.js";
import { MapleScopedSpanProcessor } from "@/utils/otel/MapleScopedSpanProcessor.js";

const createSpan = ({ traceId }: { traceId: string }): ReadableSpan =>
	({
		name: "drizzle.select",
		kind: SpanKind.CLIENT,
		attributes: {},
		resource: {} as ReadableSpan["resource"],
		instrumentationScope: { name: "test" },
		status: { code: SpanStatusCode.OK },
		events: [],
		links: [],
		startTime: [0, 0],
		endTime: [0, 1],
		duration: [0, 1],
		ended: true,
		droppedAttributesCount: 0,
		droppedEventsCount: 0,
		droppedLinksCount: 0,
		spanContext: () => ({ traceId, spanId: "0000000000000001", traceFlags: 1 }),
	}) as ReadableSpan;

class CapturingSpanProcessor implements SpanProcessor {
	readonly ended: ReadableSpan[] = [];
	flushed = 0;
	onStart(): void {}
	onEnd(span: ReadableSpan): void {
		this.ended.push(span);
	}
	forceFlush(): Promise<void> {
		this.flushed++;
		return Promise.resolve();
	}
	shutdown(): Promise<void> {
		return Promise.resolve();
	}
}

describe("isMapleScopedRequest", () => {
	test("accepts billing POSTs and Stripe webhooks", () => {
		for (const path of [
			"/v1/billing.attach",
			"/v1/billing.update",
			"/v1/attach",
			"/v1/checkout",
			"/v1/setup_payment",
			"/webhooks/connect/live",
			"/webhooks/stripe/org_123/sandbox",
		]) {
			expect(isMapleScopedRequest({ method: "POST", path })).toBe(true);
		}
	});

	test("rejects other routes and methods", () => {
		expect(
			isMapleScopedRequest({ method: "POST", path: "/v1/balances.track" }),
		).toBe(false);
		expect(
			isMapleScopedRequest({ method: "POST", path: "/v1/customers.get" }),
		).toBe(false);
		expect(
			isMapleScopedRequest({ method: "GET", path: "/v1/billing.attach" }),
		).toBe(false);
		expect(
			isMapleScopedRequest({ method: "POST", path: "/webhooks/vercel/x" }),
		).toBe(false);
		expect(
			isMapleScopedRequest({ method: "POST", path: "/billing.attach" }),
		).toBe(false);
	});
});

describe("markTraceForMaple", () => {
	test("evicts the oldest mark once the cap is reached", () => {
		const first = "f".repeat(32);
		markTraceForMaple(first);
		for (let i = 0; i < 10_000; i++) {
			markTraceForMaple(i.toString(16).padStart(32, "0"));
		}
		expect(isTraceMarkedForMaple(first)).toBe(false);
		expect(isTraceMarkedForMaple((9_999).toString(16).padStart(32, "0"))).toBe(
			true,
		);
	});
});

describe("MapleScopedSpanProcessor", () => {
	test("forwards only spans of marked traces", () => {
		const delegate = new CapturingSpanProcessor();
		const marked = new Set(["a".repeat(32)]);
		const processor = new MapleScopedSpanProcessor(delegate, (traceId) =>
			marked.has(traceId),
		);

		processor.onEnd(createSpan({ traceId: "a".repeat(32) }));
		processor.onEnd(createSpan({ traceId: "b".repeat(32) }));

		expect(delegate.ended.map((span) => span.spanContext().traceId)).toEqual([
			"a".repeat(32),
		]);
	});
});

describe("FanoutSpanProcessor", () => {
	test("hands every span to every delegate and flushes all of them", async () => {
		const axiom = new CapturingSpanProcessor();
		const maple = new CapturingSpanProcessor();
		const processor = new FanoutSpanProcessor([axiom, maple]);

		processor.onEnd(createSpan({ traceId: "c".repeat(32) }));
		await processor.forceFlush();

		expect(axiom.ended).toHaveLength(1);
		expect(maple.ended).toHaveLength(1);
		expect(axiom.flushed + maple.flushed).toBe(2);
	});
});
