/**
 * Contract: billing, webhooks and state-changing calls reach Maple whole; reads
 * and the hot path only with scope `api`, sampled at the root but always kept
 * when the request failed, was denied or was slow. Worker jobs follow the same
 * scopes, and a trace sent to Maple can stand in for its request log line.
 */

import { describe, expect, test } from "bun:test";
import {
	type Attributes,
	type Span,
	type SpanContext,
	SpanKind,
	SpanStatusCode,
} from "@opentelemetry/api";
import type {
	ReadableSpan,
	SpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import {
	addMapleTraceRoot,
	classifyMapleJob,
	classifyMapleRequest,
	getMapleTraceMark,
	isLogReplacedByMapleTrace,
	type MapleTraceMode,
	type MapleTraceScope,
	markTraceForMaple,
} from "@/external/maple/mapleTraceScope.js";
import { JobName } from "@/queue/JobName.js";
import { MapleScopedSpanProcessor } from "@/utils/otel/MapleScopedSpanProcessor.js";
import {
	formatTraceparent,
	parseTraceparent,
} from "@/utils/otel/traceparent.js";

const TRACE = "a".repeat(32);
const ROOT = "0000000000000001";

const createSpan = ({
	spanId,
	durationMs = 5,
	statusCode = 200,
	attributes,
	parentSpanContext,
}: {
	spanId: string;
	durationMs?: number;
	statusCode?: number;
	attributes?: Attributes;
	parentSpanContext?: SpanContext;
}): ReadableSpan =>
	({
		name: "span",
		parentSpanContext,
		kind: SpanKind.SERVER,
		attributes: { "http.response.status_code": statusCode, ...attributes },
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
	readonly spans: ReadableSpan[] = [];
	onStart(): void {}
	onEnd(span: ReadableSpan): void {
		this.ended.push(span.spanContext().spanId);
		this.spans.push(span);
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

	test("hot scope is billing plus the sampled hot path", () => {
		expect(classify("POST", "/v1/billing.attach", "hot")).toBe("keep");
		expect(classify("POST", "/webhooks/stripe/org_1/live", "hot")).toBe("keep");
		expect(classify("POST", "/v1/balances.check", "hot")).toBe("sample");
		expect(classify("POST", "/v1/track", "hot")).toBe("sample");
		expect(classify("POST", "/v1/customers.update", "hot")).toBeNull();
		expect(classify("POST", "/v1/customers.get", "hot")).toBeNull();
	});
});

describe("classifyMapleJob", () => {
	const classify = (jobName: string, scope: MapleTraceScope = "writes") =>
		classifyMapleJob({ jobName, scope });

	test("keeps billing jobs in every scope", () => {
		for (const jobName of [
			JobName.AutoTopUp,
			JobName.StripeWebhookReplay,
			JobName.StoreInvoiceLineItems,
			JobName.StoreDeferredInvoiceLineItems,
		]) {
			for (const scope of ["billing", "hot", "writes", "api"] as const) {
				expect(classify(jobName, scope)).toBe("keep");
			}
		}
	});

	test("samples hot jobs with scope hot or api and leaves them out otherwise", () => {
		for (const jobName of [
			JobName.Track,
			JobName.InsertEventBatch,
			JobName.SyncBalanceBatchV4,
			JobName.SyncCustomerDirty,
		]) {
			expect(classify(jobName, "billing")).toBeNull();
			expect(classify(jobName)).toBeNull();
			expect(classify(jobName, "hot")).toBe("sample");
			expect(classify(jobName, "api")).toBe("sample");
		}
	});

	test("keeps every other job with scope writes or api", () => {
		expect(classify(JobName.SendProductsUpdated)).toBe("keep");
		expect(classify(JobName.SendProductsUpdated, "api")).toBe("keep");
		expect(classify(JobName.SendProductsUpdated, "hot")).toBeNull();
		expect(classify(JobName.SendProductsUpdated, "billing")).toBeNull();
	});
});

describe("isLogReplacedByMapleTrace", () => {
	const replaced = ({
		traceId,
		method = "POST",
		path = "/v1/balances.check",
		statusCode = 200,
	}: {
		traceId: string | undefined;
		method?: string;
		path?: string;
		statusCode?: number;
	}) =>
		isLogReplacedByMapleTrace({
			req: { method, path },
			statusCode,
			traceId,
			enabled: true,
		});

	test("replaces the summary line of a covered request that did not fail", () => {
		const traceId = "b".repeat(32);
		markTraceForMaple({ traceId, rootSpanId: "r1", mode: "sample" });

		expect(replaced({ traceId })).toBe(true);
		expect(replaced({ traceId, statusCode: 404 })).toBe(true);
		expect(replaced({ traceId, statusCode: 500 })).toBe(false);
		expect(
			isLogReplacedByMapleTrace({
				req: { method: "POST", path: "/v1/balances.check" },
				statusCode: 200,
				traceId,
				enabled: false,
			}),
		).toBe(false);
	});

	test("keeps the line of a request whose trace does not go to Maple", () => {
		expect(replaced({ traceId: "f".repeat(32) })).toBe(false);
		expect(replaced({ traceId: undefined })).toBe(false);
	});

	test("a request the trace does not cover keeps its line, even under a marked trace id", () => {
		const traceId = "9".repeat(32);
		markTraceForMaple({ traceId, rootSpanId: "r1", mode: "sample" });

		// The covered request that marked the trace, then others sent with its trace id.
		expect(replaced({ traceId })).toBe(true);
		expect(replaced({ traceId, path: "/v1/customers.update" })).toBe(false);
		expect(replaced({ traceId, path: "/v1/customers.get" })).toBe(false);
		expect(replaced({ traceId, method: "GET" })).toBe(false);
	});

	test("a rate-limited request on a covered route keeps its line", () => {
		const traceId = "8".repeat(32);
		markTraceForMaple({ traceId, rootSpanId: "r1", mode: "sample" });

		expect(replaced({ traceId, statusCode: 429 })).toBe(false);
	});
});

describe("markTraceForMaple", () => {
	test("a kept request joining a sampled trace promotes it and is a root too", () => {
		const traceId = "c".repeat(32);
		markTraceForMaple({ traceId, rootSpanId: "a1", mode: "sample" });
		markTraceForMaple({ traceId, rootSpanId: "b2", mode: "keep" });

		const mark = getMapleTraceMark(traceId);
		expect(mark?.mode).toBe("keep");
		expect(mark?.rootSpanId).toBe("a1");
		expect([...(mark?.rootSpanIds ?? [])]).toEqual(["a1", "b2"]);
	});

	test("stops adding roots to a trace at the cap, and keeps the trace whole from then on", () => {
		const traceId = "e".repeat(32);
		for (let i = 0; i < 100; i++) {
			markTraceForMaple({ traceId, rootSpanId: `r${i}`, mode: "sample" });
		}

		const mark = getMapleTraceMark(traceId);
		expect(mark?.rootSpanIds.size).toBe(64);
		expect(mark?.rootSpanIds.has("r63")).toBe(true);
		expect(mark?.rootSpanIds.has("r64")).toBe(false);
		// An untracked root could not decide the trace, so it is no longer sampled.
		expect(mark?.mode).toBe("keep");

		addMapleTraceRoot({
			spanContext: () => ({ traceId, spanId: "deferred", traceFlags: 1 }),
		} as Span);
		markTraceForMaple({ traceId, rootSpanId: "late", mode: "keep" });
		expect(mark?.rootSpanIds.size).toBe(64);
		expect(mark?.mode).toBe("keep");
	});
});

describe("traceparent", () => {
	test("round-trips a span context as a remote parent", () => {
		const traceparent = formatTraceparent({
			spanContext: { traceId: TRACE, spanId: ROOT, traceFlags: 1 },
		});
		expect(traceparent).toBe(`00-${TRACE}-${ROOT}-01`);
		expect(parseTraceparent({ traceparent })).toEqual({
			traceId: TRACE,
			spanId: ROOT,
			traceFlags: 1,
			isRemote: true,
		});
	});

	test("ignores a value that is not a usable parent", () => {
		for (const traceparent of [
			42,
			{ a: 1 },
			`00-${"0".repeat(32)}-${"1".repeat(16)}-01`,
			`00-${"a".repeat(32)}-${"0".repeat(16)}-01`,
		]) {
			expect(
				parseTraceparent({ traceparent: traceparent as string }),
			).toBeUndefined();
		}
	});

	test("ignores a missing or malformed header", () => {
		expect(parseTraceparent({})).toBeUndefined();
		expect(parseTraceparent({ traceparent: "00-abc-def-01" })).toBeUndefined();
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

	test("keeps a sampled trace whose root was a client error or a denial", () => {
		for (const root of [
			createSpan({ spanId: ROOT, statusCode: 404 }),
			createSpan({ spanId: ROOT, attributes: { "check.allowed": false } }),
			createSpan({ spanId: ROOT, attributes: { "check.fail_open": true } }),
		]) {
			const { processor, delegate } = processorFor({
				mode: "sample",
				sampleRate: 0,
			});
			processor.onEnd(createSpan({ spanId: "0000000000000002" }));
			processor.onEnd(root);
			expect(delegate.ended).toEqual(["0000000000000002", ROOT]);
		}
	});

	test("sends child spans without the tenant attrs the root carries", () => {
		const tenant = { org_id: "org_1", customer_id: "cus_1" };
		for (const mode of ["keep", "sample"] as const) {
			const { processor, delegate } = processorFor({ mode, sampleRate: 1 });
			processor.onEnd(
				createSpan({
					spanId: "0000000000000002",
					attributes: { ...tenant, "db.system": "postgresql" },
					parentSpanContext: { traceId: TRACE, spanId: ROOT, traceFlags: 1 },
				}),
			);
			processor.onEnd(createSpan({ spanId: ROOT, attributes: tenant }));

			const [child, root] = delegate.spans;
			expect(child.attributes).toEqual({
				"http.response.status_code": 200,
				"db.system": "postgresql",
			});
			expect(root.attributes).toMatchObject(tenant);
		}
	});

	test("a second request under the same trace id keeps its tenant attrs and promotes the trace", () => {
		const SECOND = "0000000000000009";
		const tenant = { org_id: "org_1" };
		const marks = new Map([
			[
				TRACE,
				{
					mode: "sample" as MapleTraceMode,
					rootSpanId: ROOT,
					rootSpanIds: new Set([ROOT, SECOND]),
				},
			],
		]);
		const delegate = new CapturingSpanProcessor();
		const processor = new MapleScopedSpanProcessor(delegate, {
			sampleRate: 0,
			slowMs: 1000,
			marks: {
				get: (traceId) => marks.get(traceId),
				promote: () => {},
				unmark: (traceId) => {
					marks.delete(traceId);
				},
			},
		});

		// A child of the sampled first request waits for its verdict.
		processor.onEnd(createSpan({ spanId: "0000000000000002" }));
		expect(delegate.ended).toEqual([]);

		// The second request is a state change: the mark becomes keep.
		const mark = marks.get(TRACE);
		if (mark) mark.mode = "keep";
		processor.onEnd(createSpan({ spanId: SECOND, attributes: tenant }));

		expect(delegate.ended).toEqual(["0000000000000002", SECOND]);
		expect(delegate.spans[1].attributes).toMatchObject(tenant);
	});

	test("a request that must be kept is, whichever request of the trace ends first", () => {
		const SECOND = "0000000000000009";
		const setup = () => {
			const marks = new Map([
				[
					TRACE,
					{
						mode: "sample" as MapleTraceMode,
						rootSpanId: ROOT,
						rootSpanIds: new Set([ROOT, SECOND]),
					},
				],
			]);
			const delegate = new CapturingSpanProcessor();
			const processor = new MapleScopedSpanProcessor(delegate, {
				sampleRate: 0,
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
			return { marks, delegate, processor };
		};

		// The healthy first request ends before the failed second one.
		const first = setup();
		first.processor.onEnd(createSpan({ spanId: ROOT }));
		expect(first.delegate.ended).toEqual([]);
		first.processor.onEnd(createSpan({ spanId: SECOND, statusCode: 404 }));
		expect(first.delegate.ended).toEqual([ROOT, SECOND]);

		// The failed second request ends first.
		const second = setup();
		second.processor.onEnd(createSpan({ spanId: SECOND, statusCode: 404 }));
		second.processor.onEnd(createSpan({ spanId: ROOT }));
		expect(second.delegate.ended).toEqual([SECOND, ROOT]);

		// Both healthy and out of the rate: nothing is exported, nothing lingers.
		const neither = setup();
		neither.processor.onEnd(createSpan({ spanId: SECOND }));
		neither.processor.onEnd(createSpan({ spanId: ROOT }));
		expect(neither.delegate.ended).toEqual([]);
		expect(neither.marks.has(TRACE)).toBe(false);
	});

	test("a request of a marked trace that the scope left out keeps its tenant attrs, its children do not", () => {
		const OTHER = "0000000000000009";
		const tenant = { org_id: "org_2" };
		const otherRoot = (statusCode?: number) =>
			createSpan({
				spanId: OTHER,
				statusCode,
				attributes: tenant,
				// The caller's span: the request arrived with a traceparent.
				parentSpanContext: {
					traceId: TRACE,
					spanId: "00000000000000aa",
					traceFlags: 1,
					isRemote: true,
				},
			});

		const kept = processorFor({ mode: "keep", sampleRate: 0 });
		kept.processor.onEnd(
			createSpan({
				spanId: "0000000000000002",
				attributes: tenant,
				parentSpanContext: { traceId: TRACE, spanId: OTHER, traceFlags: 1 },
			}),
		);
		kept.processor.onEnd(otherRoot());
		const [child, root] = kept.delegate.spans;
		expect(child.attributes).toEqual({ "http.response.status_code": 200 });
		expect(root.attributes).toMatchObject(tenant);

		// It was never marked, so it does not decide a sampled trace.
		const sampled = processorFor({ mode: "sample", sampleRate: 0 });
		sampled.processor.onEnd(otherRoot(503));
		expect(sampled.delegate.ended).toEqual([]);
		sampled.processor.onEnd(createSpan({ spanId: ROOT, statusCode: 404 }));
		expect(sampled.delegate.ended).toEqual([OTHER, ROOT]);
		expect(sampled.delegate.spans[0].attributes).toMatchObject(tenant);
	});

	test("a rate-limited request is sampled like a healthy one, so it keeps its log line", () => {
		const { processor, delegate } = processorFor({
			mode: "sample",
			sampleRate: 0,
		});
		processor.onEnd(createSpan({ spanId: ROOT, statusCode: 429 }));
		expect(delegate.ended).toEqual([]);

		const traceId = "6".repeat(32);
		markTraceForMaple({ traceId, rootSpanId: ROOT, mode: "sample" });
		const logSide = {
			req: { method: "POST", path: "/v1/track" },
			traceId,
			enabled: true,
		};
		expect(isLogReplacedByMapleTrace({ ...logSide, statusCode: 429 })).toBe(
			false,
		);
		expect(isLogReplacedByMapleTrace({ ...logSide, statusCode: 200 })).toBe(
			true,
		);
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
