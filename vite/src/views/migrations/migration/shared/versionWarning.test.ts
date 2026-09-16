import { expect, test } from "bun:test";
import {
	needsVersionOnlyWarning,
	versionOnlyWarningVersions,
	versionWarningText,
} from "./operationUtils";

const planFilter = { plan_id: "pro" };

test("version without customize needs the warning", () => {
	expect(
		needsVersionOnlyWarning({
			type: "update_plan",
			plan_filter: planFilter,
			version: 3,
		}),
	).toBe(true);
});

test("version with item or price customize is the safe path", () => {
	expect(
		needsVersionOnlyWarning({
			type: "update_plan",
			plan_filter: planFilter,
			version: 3,
			customize: { add_items: [{ feature_id: "dashboard" }] },
		}),
	).toBe(false);
	expect(
		needsVersionOnlyWarning({
			type: "update_plan",
			plan_filter: planFilter,
			version: 3,
			customize: { price: { amount: 10, interval: "month" } },
		}),
	).toBe(false);
});

test("customize-only and add_plan ops never warn", () => {
	expect(
		needsVersionOnlyWarning({
			type: "update_plan",
			plan_filter: planFilter,
			customize: { add_items: [{ feature_id: "dashboard" }] },
		}),
	).toBe(false);
	expect(needsVersionOnlyWarning({ type: "add_plan", plan_id: "pro" })).toBe(
		false,
	);
});

test("warning versions are collected once each across operations", () => {
	expect(
		versionOnlyWarningVersions({
			customer: [
				{ type: "update_plan", plan_filter: planFilter, version: 3 },
				{ type: "update_plan", plan_filter: { plan_id: "team" }, version: 3 },
				{ type: "update_plan", plan_filter: { plan_id: "free" }, version: 2 },
				{
					type: "update_plan",
					plan_filter: planFilter,
					version: 4,
					customize: { remove_items: [{ feature_id: "dashboard" }] },
				},
			],
		}),
	).toEqual([2, 3]);
});

test("warning text names the target version", () => {
	expect(versionWarningText(3)).toBe(
		"This directly sets customers to v3 and replaces all their items, overriding any customized plans. Combine with customize for a safer operation.",
	);
});
