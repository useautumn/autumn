import { describe, expect, test } from "bun:test";
import { buildLimitReachedIdempotencyKey } from "../../src/balanceWebhooks.js";

const base = {
	orgId: "org_1",
	env: "sandbox",
	customerId: "cus_1",
	entityId: null,
	featureId: "messages",
	limitType: "included" as const,
	filter: undefined,
	commandId: "cmd_1",
};

describe("buildLimitReachedIdempotencyKey", () => {
	test("the command names the crossing: the same inputs always key the same", () => {
		expect(buildLimitReachedIdempotencyKey(base)).toBe(
			buildLimitReachedIdempotencyKey({ ...base }),
		);
		expect(buildLimitReachedIdempotencyKey(base)).toBe(
			"limit_reached:org_1:sandbox:cus_1:_:messages:included:_:cmd_1",
		);
	});

	test("command, entity, feature, limit type and filter each make a distinct key", () => {
		const key = buildLimitReachedIdempotencyKey(base);
		expect(
			buildLimitReachedIdempotencyKey({ ...base, commandId: "cmd_2" }),
		).not.toBe(key);
		expect(
			buildLimitReachedIdempotencyKey({ ...base, entityId: "ent_1" }),
		).not.toBe(key);
		expect(
			buildLimitReachedIdempotencyKey({ ...base, featureId: "words" }),
		).not.toBe(key);
		expect(
			buildLimitReachedIdempotencyKey({ ...base, limitType: "usage_limit" }),
		).not.toBe(key);
		expect(
			buildLimitReachedIdempotencyKey({
				...base,
				limitType: "usage_limit",
				filter: { properties: { model: "gpt" } },
			}),
		).not.toBe(
			buildLimitReachedIdempotencyKey({ ...base, limitType: "usage_limit" }),
		);
	});

	test("filter order does not change the key", () => {
		const left = buildLimitReachedIdempotencyKey({
			...base,
			limitType: "usage_limit",
			filter: { properties: { a: "1", b: "2" } },
		});
		const right = buildLimitReachedIdempotencyKey({
			...base,
			limitType: "usage_limit",
			filter: { properties: { b: "2", a: "1" } },
		});
		expect(left).toBe(right);
	});
});
