import { describe, expect, test } from "bun:test";
import { type Context, SpanKind, SpanStatusCode } from "@opentelemetry/api";
import type {
	ReadableSpan,
	SpanProcessor,
	Span as WritableSpan,
} from "@opentelemetry/sdk-trace-base";
import { FilteringSpanProcessor } from "@/utils/otel/FilteringSpanProcessor.js";

const createSpan = ({
	name,
	attributes,
	statusCode = SpanStatusCode.OK,
	durationMs = 0.000001,
}: {
	name: string;
	attributes: ReadableSpan["attributes"];
	statusCode?: SpanStatusCode;
	durationMs?: number;
}): ReadableSpan =>
	({
		name,
		kind: SpanKind.CLIENT,
		attributes,
		resource: {} as ReadableSpan["resource"],
		instrumentationScope: { name: "test" },
		status: { code: statusCode },
		events: [],
		links: [],
		startTime: [0, 0],
		endTime: [0, 1],
		duration: [Math.floor(durationMs / 1000), (durationMs % 1000) * 1_000_000],
		ended: true,
		droppedAttributesCount: 0,
		droppedEventsCount: 0,
		droppedLinksCount: 0,
		spanContext: () => ({
			traceId: "00000000000000000000000000000001",
			spanId: "0000000000000001",
			traceFlags: 1,
		}),
	}) as ReadableSpan;

class CapturingSpanProcessor implements SpanProcessor {
	readonly started: Array<{ span: WritableSpan; parentContext: Context }> = [];
	readonly ended: ReadableSpan[] = [];
	forceFlushCount = 0;
	shutdownCount = 0;

	onStart(span: WritableSpan, parentContext: Context): void {
		this.started.push({ span, parentContext });
	}

	onEnd(span: ReadableSpan): void {
		this.ended.push(span);
	}

	forceFlush(): Promise<void> {
		this.forceFlushCount++;
		return Promise.resolve();
	}

	shutdown(): Promise<void> {
		this.shutdownCount++;
		return Promise.resolve();
	}
}

describe("FilteringSpanProcessor", () => {
	test("compacts repeated Drizzle statements before delegating export", () => {
		const delegate = new CapturingSpanProcessor();
		const processor = new FilteringSpanProcessor(delegate);
		const statement = "select * from organizations where id = $1";

		processor.onEnd(
			createSpan({
				name: "drizzle.select",
				attributes: {
					"db.statement": statement,
					org_id: "org_123",
				},
			}),
		);
		processor.onEnd(
			createSpan({
				name: "drizzle.select",
				attributes: {
					"db.statement": statement,
					org_id: "org_123",
				},
			}),
		);

		expect(delegate.ended).toHaveLength(2);
		expect(delegate.ended[0]?.attributes["db.statement"]).toBe(statement);
		expect(delegate.ended[0]?.attributes["db.query_definition"]).toBe(true);
		expect(delegate.ended[1]?.attributes["db.statement"]).toBeUndefined();
		expect(delegate.ended[1]?.attributes["db.query_id"]).toBe(
			delegate.ended[0]?.attributes["db.query_id"],
		);
		expect(delegate.ended[1]?.attributes.org_id).toBe("org_123");
	});

	test("forwards non-Drizzle spans without replacing them", () => {
		const delegate = new CapturingSpanProcessor();
		const processor = new FilteringSpanProcessor(delegate);
		const source = createSpan({
			name: "stripe.invoices.retrieve",
			attributes: { "stripe.invoice_id": "in_123" },
		});

		processor.onEnd(source);

		expect(delegate.ended).toEqual([source]);
	});

	test("exports the original span when custom processing fails", () => {
		const delegate = new CapturingSpanProcessor();
		const processor = new FilteringSpanProcessor(delegate);
		const source = createSpan({
			name: "drizzle.select",
			attributes: { "db.statement": "select 1" },
		});

		Object.assign(
			processor as unknown as {
				spanIngestCompactor: { compact: () => ReadableSpan };
			},
			{
				spanIngestCompactor: {
					compact: () => {
						throw new Error("compaction failed");
					},
				},
			},
		);

		expect(() => processor.onEnd(source)).not.toThrow();
		expect(delegate.ended).toEqual([source]);
	});

	test("keeps SQL on repeated slow Drizzle spans at export", () => {
		const delegate = new CapturingSpanProcessor();
		const processor = new FilteringSpanProcessor(delegate);
		const statement = "update customers set updated_at = now() where id = $1";

		processor.onEnd(
			createSpan({
				name: "drizzle.update",
				attributes: { "db.statement": statement },
			}),
		);
		processor.onEnd(
			createSpan({
				name: "drizzle.update",
				attributes: { "db.statement": statement },
				durationMs: 100,
			}),
		);

		expect(delegate.ended[1]?.attributes["db.statement"]).toBe(statement);
		expect(
			delegate.ended[1]?.attributes["db.query_definition"],
		).toBeUndefined();
	});

	test("always exports successful severe Redis spans", () => {
		const delegate = new CapturingSpanProcessor();
		// rate 0 would drop any non-severe span, so surviving proves the bypass.
		const processor = new FilteringSpanProcessor(delegate, 0);
		const source = createSpan({
			name: "redis.get",
			attributes: {
				"db.redis.severe": true,
				"db.redis.org_id": "org_123",
			},
		});

		processor.onEnd(source);

		expect(delegate.ended).toEqual([source]);
	});

	// `db.redis.slow` trips at a 15ms bar that nearly every command clears, so it
	// no longer bypasses sampling — only `db.redis.severe` does.
	test("samples successful slow-but-not-severe Redis spans", () => {
		const delegate = new CapturingSpanProcessor();
		// rate 0 => every non-severe success is dropped, so the assertion tests the
		// severe-vs-slow rule rather than where one span's hash lands.
		const processor = new FilteringSpanProcessor(delegate, 0);
		const source = createSpan({
			name: "redis.get",
			attributes: {
				"db.redis.slow": true,
				"db.redis.org_id": "org_123",
			},
		});

		processor.onEnd(source);

		expect(delegate.ended).toEqual([]);
	});

	test("always exports failed Redis spans even when they are not marked slow", () => {
		const delegate = new CapturingSpanProcessor();
		const processor = new FilteringSpanProcessor(delegate);
		const source = createSpan({
			name: "redis.set",
			attributes: {
				"db.redis.org_id": "org_123",
			},
			statusCode: SpanStatusCode.ERROR,
		});

		processor.onEnd(source);

		expect(delegate.ended).toEqual([source]);
	});

	test("forwards lifecycle calls to the wrapped processor", async () => {
		const delegate = new CapturingSpanProcessor();
		const processor = new FilteringSpanProcessor(delegate);
		const span = {} as WritableSpan;
		const parentContext = {} as Context;

		processor.onStart(span, parentContext);
		await processor.forceFlush();
		await processor.shutdown();

		expect(delegate.started).toEqual([{ span, parentContext }]);
		expect(delegate.forceFlushCount).toBe(1);
		expect(delegate.shutdownCount).toBe(1);
	});
});
