import { describe, expect, test } from "bun:test";
import {
	findUnresolvableUsageLimitAlerts,
	usageAlertIdentity,
} from "@autumn/shared";

const alert = ({
	basis,
	filter,
	threshold = 80,
}: {
	basis?: "balance" | "included" | "recurring" | "usage_limit";
	filter?: { properties: Record<string, string> };
	threshold?: number;
}) => ({
	feature_id: "messages",
	enabled: true,
	threshold,
	threshold_type: "usage_percentage" as const,
	...(basis && { basis }),
	...(filter && { filter }),
});

describe("usageAlertIdentity", () => {
	test("a missing basis reads as balance", () => {
		expect(usageAlertIdentity(alert({}))).toBe(
			usageAlertIdentity(alert({ basis: "balance" })),
		);
	});

	test("basis is part of the identity", () => {
		expect(usageAlertIdentity(alert({ basis: "included" }))).not.toBe(
			usageAlertIdentity(alert({ basis: "balance" })),
		);
	});

	test("filters canonicalise by sorted key=value pairs", () => {
		const left = usageAlertIdentity(
			alert({
				basis: "usage_limit",
				filter: { properties: { b: "2", a: "1" } },
			}),
		);
		const right = usageAlertIdentity(
			alert({
				basis: "usage_limit",
				filter: { properties: { a: "1", b: "2" } },
			}),
		);
		expect(left).toBe(right);
	});
});

describe("findUnresolvableUsageLimitAlerts", () => {
	const dailyLimit = (filter?: { properties: Record<string, string> }) => ({
		feature_id: "messages",
		...(filter && { filter }),
	});

	test("alerts on balance-backed bases never need a limit", () => {
		expect(
			findUnresolvableUsageLimitAlerts({
				usageAlerts: [
					alert({ basis: "balance" }),
					alert({ basis: "included" }),
					alert({ basis: "recurring" }),
				],
				usageLimitLists: [[]],
			}),
		).toEqual([]);
	});

	test("a usage_limit alert resolves against any list, matching filter identity", () => {
		const usageAlerts = [
			alert({ basis: "usage_limit" }),
			alert({ basis: "usage_limit", filter: { properties: { key: "a" } } }),
			alert({ basis: "usage_limit", filter: { properties: { key: "b" } } }),
		];
		const unresolvable = findUnresolvableUsageLimitAlerts({
			usageAlerts,
			usageLimitLists: [
				[dailyLimit()],
				null,
				[dailyLimit({ properties: { key: "a" } })],
			],
		});
		expect(unresolvable.map(({ index }) => index)).toEqual([2]);
	});
});
