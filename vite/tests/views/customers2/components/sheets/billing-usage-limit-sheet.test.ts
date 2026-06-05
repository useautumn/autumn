import { describe, expect, test } from "bun:test";
import { type DbSpendLimit, EntInterval } from "@autumn/shared";
import {
	buildUsageLimitItem,
	INHERIT_WINDOW,
} from "@/views/customers2/components/sheets/BillingUsageLimitSheet";

describe("buildUsageLimitItem", () => {
	test("new cap with inherited window omits the interval (cap armed by usage_limit)", () => {
		const item = buildUsageLimitItem({
			featureId: "credits",
			usageLimit: 5,
			window: INHERIT_WINDOW,
		});
		expect(item.feature_id).toBe("credits");
		expect(item.usage_limit).toBe(5);
		expect(item.usage_limit_interval).toBeUndefined();
		expect(item.enabled).toBe(false);
	});

	test("explicit window sets usage_limit_interval", () => {
		const item = buildUsageLimitItem({
			featureId: "credits",
			usageLimit: 10,
			window: EntInterval.Day,
		});
		expect(item.usage_limit).toBe(10);
		expect(item.usage_limit_interval).toBe(EntInterval.Day);
	});

	test("editing preserves a co-located overage limit + enabled", () => {
		const existing: DbSpendLimit = {
			feature_id: "credits",
			enabled: true,
			overage_limit: 100,
		};
		const item = buildUsageLimitItem({
			existing,
			featureId: "credits",
			usageLimit: 3,
			window: EntInterval.Month,
		});
		expect(item.overage_limit).toBe(100);
		expect(item.enabled).toBe(true);
		expect(item.usage_limit).toBe(3);
		expect(item.usage_limit_interval).toBe(EntInterval.Month);
	});

	test("empty feature falls back to undefined feature_id", () => {
		const item = buildUsageLimitItem({
			featureId: "",
			usageLimit: 1,
			window: INHERIT_WINDOW,
		});
		expect(item.feature_id).toBeUndefined();
	});
});
