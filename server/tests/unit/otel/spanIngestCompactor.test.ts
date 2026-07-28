import { describe, expect, test } from "bun:test";
import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { SpanIngestCompactor } from "@/utils/otel/SpanIngestCompactor.js";

const createSpan = ({
	name,
	attributes,
	durationMs = 0.000001,
}: {
	name: string;
	attributes: ReadableSpan["attributes"];
	durationMs?: number;
}): ReadableSpan =>
	({
		name,
		kind: SpanKind.CLIENT,
		attributes,
		resource: {} as ReadableSpan["resource"],
		instrumentationScope: { name: "test" },
		status: { code: SpanStatusCode.OK },
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

describe("SpanIngestCompactor", () => {
	test("retains one full Drizzle query definition and references it thereafter", () => {
		const compactor = new SpanIngestCompactor();
		const statement = 'insert into "events" ("id", "org_id") values ($1, $2)';
		const searchableAttributes = {
			req_id: "req_123",
			org_id: "org_123",
			customer_id: "cus_123",
			entity_id: "ent_123",
		};
		const firstSource = createSpan({
			name: "drizzle.insert",
			attributes: {
				...searchableAttributes,
				"db.operation": "INSERT",
				"db.statement": statement,
			},
		});
		const repeatedSource = createSpan({
			name: "drizzle.insert",
			attributes: {
				...searchableAttributes,
				"db.operation": "INSERT",
				"db.statement": statement,
			},
		});

		const first = compactor.compact({ span: firstSource });
		const repeated = compactor.compact({ span: repeatedSource });

		expect(first.attributes["db.statement"]).toBe(statement);
		expect(first.attributes["db.query_definition"]).toBe(true);
		expect(first.attributes["db.query_id"]).toMatch(/^[a-f0-9]{16}$/);

		expect(repeated.attributes["db.statement"]).toBeUndefined();
		expect(repeated.attributes["db.query_definition"]).toBeUndefined();
		expect(repeated.attributes["db.query_id"]).toBe(
			first.attributes["db.query_id"],
		);

		for (const [key, value] of Object.entries(searchableAttributes)) {
			expect(first.attributes[key]).toBe(value);
			expect(repeated.attributes[key]).toBe(value);
		}

		expect(firstSource.attributes["db.statement"]).toBe(statement);
		expect(repeatedSource.attributes["db.statement"]).toBe(statement);
	});

	test("retains definitions independently for different SQL statements", () => {
		const compactor = new SpanIngestCompactor();
		const first = compactor.compact({
			span: createSpan({
				name: "drizzle.select",
				attributes: { "db.statement": "select 1" },
			}),
		});
		const second = compactor.compact({
			span: createSpan({
				name: "drizzle.select",
				attributes: { "db.statement": "select 2" },
			}),
		});

		expect(first.attributes["db.query_definition"]).toBe(true);
		expect(second.attributes["db.query_definition"]).toBe(true);
		expect(first.attributes["db.query_id"]).not.toBe(
			second.attributes["db.query_id"],
		);
	});

	test("generates the same query id across processes for the same statement", () => {
		const statement = "select * from customers where id = $1";
		const first = new SpanIngestCompactor().compact({
			span: createSpan({
				name: "drizzle.select",
				attributes: { "db.statement": statement },
			}),
		});
		const second = new SpanIngestCompactor().compact({
			span: createSpan({
				name: "drizzle.select",
				attributes: { "db.statement": statement },
			}),
		});

		expect(first.attributes["db.query_id"]).toBe(
			second.attributes["db.query_id"],
		);
	});

	test("preserves the full span interface when replacing attributes", () => {
		const source = createSpan({
			name: "drizzle.select",
			attributes: { "db.statement": "select 1" },
		});

		const compacted = new SpanIngestCompactor().compact({ span: source });

		expect(compacted.name).toBe(source.name);
		expect(compacted.status).toBe(source.status);
		expect(compacted.duration).toBe(source.duration);
		expect(compacted.resource).toBe(source.resource);
		expect(compacted.spanContext()).toEqual(source.spanContext());
	});

	test("retains SQL on repeated slow spans for Axiom slow-query investigations", () => {
		const compactor = new SpanIngestCompactor();
		const statement = "select * from customers where id = $1";
		const first = compactor.compact({
			span: createSpan({
				name: "drizzle.select",
				attributes: { "db.statement": statement },
			}),
		});
		const repeatedSlow = compactor.compact({
			span: createSpan({
				name: "drizzle.select",
				attributes: { "db.statement": statement },
				durationMs: 100,
			}),
		});
		const repeatedFast = compactor.compact({
			span: createSpan({
				name: "drizzle.select",
				attributes: { "db.statement": statement },
				durationMs: 99,
			}),
		});

		expect(first.attributes["db.query_definition"]).toBe(true);
		expect(repeatedSlow.attributes["db.statement"]).toBe(statement);
		expect(repeatedSlow.attributes["db.query_definition"]).toBeUndefined();
		expect(repeatedSlow.attributes["db.query_id"]).toBe(
			first.attributes["db.query_id"],
		);
		expect(repeatedFast.attributes["db.statement"]).toBeUndefined();
	});

	test("leaves spans without a usable SQL statement unchanged", () => {
		const compactor = new SpanIngestCompactor();
		const missingStatement = createSpan({
			name: "drizzle.select",
			attributes: { "db.operation": "SELECT" },
		});
		const emptyStatement = createSpan({
			name: "drizzle.select",
			attributes: { "db.statement": "" },
		});
		const nonStringStatement = createSpan({
			name: "drizzle.select",
			attributes: { "db.statement": 123 },
		});

		expect(compactor.compact({ span: missingStatement })).toBe(
			missingStatement,
		);
		expect(compactor.compact({ span: emptyStatement })).toBe(emptyStatement);
		expect(compactor.compact({ span: nonStringStatement })).toBe(
			nonStringStatement,
		);
	});

	test("bounds tracked query ids and safely emits an evicted definition again", () => {
		const compactor = new SpanIngestCompactor();
		const firstStatement = "select 0";

		compactor.compact({
			span: createSpan({
				name: "drizzle.select",
				attributes: { "db.statement": firstStatement },
			}),
		});
		for (let index = 1; index <= 4096; index++) {
			compactor.compact({
				span: createSpan({
					name: "drizzle.select",
					attributes: { "db.statement": `select ${index}` },
				}),
			});
		}

		const redefined = compactor.compact({
			span: createSpan({
				name: "drizzle.select",
				attributes: { "db.statement": firstStatement },
			}),
		});

		expect(redefined.attributes["db.statement"]).toBe(firstStatement);
		expect(redefined.attributes["db.query_definition"]).toBe(true);
	});

	test("does not compact Redis keys or non-Drizzle statements", () => {
		const compactor = new SpanIngestCompactor();
		const redisKey = "{org_123}:live:customer:v2:cus_123";
		const source = createSpan({
			name: "redis.get",
			attributes: { "db.statement": redisKey },
		});

		const compacted = compactor.compact({ span: source });

		expect(compacted).toBe(source);
		expect(compacted.attributes["db.statement"]).toBe(redisKey);
		expect(compacted.attributes["db.query_id"]).toBeUndefined();
	});
});
