import { describe, expect, test } from "bun:test";
import { buildUsageWindowKey, EntInterval } from "@autumn/shared";

describe("buildUsageWindowKey", () => {
	test("customer-scoped balance-dimension window", () => {
		const key = buildUsageWindowKey({
			scopeType: "customer",
			internalEntityId: null,
			dimensionType: "balance",
			dimensionFeatureId: null,
			interval: EntInterval.Day,
			windowStartAt: 1_700_000_000_000,
		});

		expect(key).toBe("customer:_:balance:_:day:1700000000000");
	});

	test("entity-scoped metered-feature window keys by internal entity id", () => {
		const key = buildUsageWindowKey({
			scopeType: "entity",
			internalEntityId: "ient_123",
			dimensionType: "metered_feature",
			dimensionFeatureId: "action1",
			interval: EntInterval.Month,
			windowStartAt: 1_700_000_000_000,
		});

		expect(key).toBe(
			"entity:ient_123:metered_feature:action1:month:1700000000000",
		);
	});

	test("is deterministic for identical inputs", () => {
		const params = {
			scopeType: "customer" as const,
			internalEntityId: null,
			dimensionType: "metered_feature" as const,
			dimensionFeatureId: "action1",
			interval: EntInterval.Month,
			windowStartAt: 1_700_000_000_000,
		};

		expect(buildUsageWindowKey(params)).toBe(buildUsageWindowKey(params));
	});

	test("distinguishes windows that differ only by dimension feature", () => {
		const base = {
			scopeType: "customer" as const,
			internalEntityId: null,
			dimensionType: "metered_feature" as const,
			interval: EntInterval.Month,
			windowStartAt: 1_700_000_000_000,
		};

		expect(
			buildUsageWindowKey({ ...base, dimensionFeatureId: "action1" }),
		).not.toBe(buildUsageWindowKey({ ...base, dimensionFeatureId: "action2" }));
	});

	test("distinguishes windows that differ only by window start", () => {
		const base = {
			scopeType: "customer" as const,
			internalEntityId: null,
			dimensionType: "balance" as const,
			dimensionFeatureId: null,
			interval: EntInterval.Day,
		};

		expect(
			buildUsageWindowKey({ ...base, windowStartAt: 1_700_000_000_000 }),
		).not.toBe(
			buildUsageWindowKey({ ...base, windowStartAt: 1_700_086_400_000 }),
		);
	});

	test("rejects a segment containing the ':' delimiter", () => {
		expect(() =>
			buildUsageWindowKey({
				scopeType: "customer",
				internalEntityId: null,
				dimensionType: "metered_feature",
				dimensionFeatureId: "a:b",
				interval: EntInterval.Month,
				windowStartAt: 1_700_000_000_000,
			}),
		).toThrow();
	});

	test("rejects a segment that is the literal null sentinel", () => {
		expect(() =>
			buildUsageWindowKey({
				scopeType: "entity",
				internalEntityId: "_",
				dimensionType: "balance",
				dimensionFeatureId: null,
				interval: EntInterval.Day,
				windowStartAt: 1_700_000_000_000,
			}),
		).toThrow();
	});
});
