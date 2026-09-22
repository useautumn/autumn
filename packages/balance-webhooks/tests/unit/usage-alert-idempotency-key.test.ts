import { describe, expect, test } from "bun:test";
import type { DbUsageAlert, Feature } from "@autumn/shared";
import { buildUsageAlertIdempotencyKey } from "../../src/balanceWebhooks.js";

const identity = { orgId: "org_1", env: "sandbox", now: 1_800_000_000_000 };

const feature = { id: "messages" } as Feature;

const keyFor = ({
	alert,
	periodStartAt = null,
}: {
	alert: Partial<DbUsageAlert>;
	periodStartAt?: number | null;
}) =>
	buildUsageAlertIdempotencyKey({
		...identity,
		customerId: "cus_1",
		scope: "customer",
		feature,
		alert: {
			feature_id: "messages",
			threshold: 80,
			threshold_type: "usage_percentage",
			enabled: true,
			...alert,
		} as DbUsageAlert,
		periodStartAt,
	});

describe("buildUsageAlertIdempotencyKey", () => {
	test("a missing basis keys like balance", () => {
		expect(keyFor({ alert: {} })).toBe(keyFor({ alert: { basis: "balance" } }));
	});

	test("basis, filter and window start each make a distinct key", () => {
		const base = keyFor({ alert: { basis: "usage_limit" } });
		expect(keyFor({ alert: { basis: "included" } })).not.toBe(base);
		expect(
			keyFor({
				alert: { basis: "usage_limit", filter: { properties: { key: "a" } } },
			}),
		).not.toBe(base);
		expect(
			keyFor({ alert: { basis: "usage_limit" }, periodStartAt: 1 }),
		).not.toBe(base);
	});

	test("filter order does not change the key", () => {
		const left = keyFor({
			alert: {
				basis: "usage_limit",
				filter: { properties: { a: "1", b: "2" } },
			},
		});
		const right = keyFor({
			alert: {
				basis: "usage_limit",
				filter: { properties: { b: "2", a: "1" } },
			},
		});
		expect(left).toBe(right);
	});
});
