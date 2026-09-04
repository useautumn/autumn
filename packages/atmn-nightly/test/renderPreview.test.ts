/** The preview prints the server's field-level diff under each changed row:
 * plan attributes as old -> new, items paired from deleted+created, license
 * links nested, feature attributes (snake_case, frozen) as "was". Creates and
 * deletes print only their row. */

import { expect, test } from "bun:test";
import chalk from "chalk";
import { renderPreview } from "../src/render/renderPreview";

chalk.level = 0;

// biome-ignore lint/suspicious/noExplicitAny: preview fixtures under test
const render = (preview: any): string => renderPreview({ preview });

const planRow = (planChange: Record<string, unknown>) => ({
	planId: "pro",
	version: 2,
	action: "update",
	name: "Pro Plus",
	planChange,
});

test("renames a plan and shows old -> new name", () => {
	const out = render({
		features: [],
		plans: [planRow({ previousAttributes: { name: "Pro" }, itemChanges: [] })],
	});
	expect(out).toContain("~ pro@v2");
	expect(out).toContain('~ Name: "Pro" -> "Pro Plus"');
});

test("shows a price change as old -> new", () => {
	const out = render({
		features: [],
		plans: [
			planRow({
				previousAttributes: null,
				priceChange: {
					previous: { amount: 10, interval: "month" },
					current: { amount: 15, interval: "month" },
				},
			}),
		],
	});
	expect(out).toContain("~ Price: $10 per month -> $15 per month");
});

test("pairs a deleted+created item on the same feature as a change", () => {
	const out = render({
		features: [],
		plans: [
			planRow({
				previousAttributes: null,
				itemChanges: [
					{
						action: "deleted",
						featureId: "messages",
						item: {
							featureId: "messages",
							included: 100,
							price: { amount: 0.5, interval: "month" },
						},
					},
					{
						action: "created",
						featureId: "messages",
						item: {
							featureId: "messages",
							included: 100,
							price: { amount: 0.4, interval: "month" },
						},
					},
				],
			}),
		],
	});
	expect(out).toContain(
		"~ messages  100 messages ($0.50 per month) -> 100 messages ($0.40 per month)",
	);
	expect(out).not.toContain("+ messages");
	expect(out).not.toContain("- messages");
});

test("shows an added and a removed item separately when features differ", () => {
	const out = render({
		features: [],
		plans: [
			planRow({
				previousAttributes: null,
				itemChanges: [
					{
						action: "created",
						featureId: "seats",
						item: {
							featureId: "seats",
							display: { primaryText: "$10 per user" },
						},
					},
					{
						action: "deleted",
						featureId: "legacy_export",
						item: { featureId: "legacy_export", included: 100 },
					},
				],
			}),
		],
	});
	expect(out).toContain("+ seats  $10 per user");
	expect(out).toContain("- legacy_export  100 legacy_export");
});

test("shows a license link's included count change nested under the plan", () => {
	const out = render({
		features: [],
		plans: [
			planRow({
				previousAttributes: null,
				licenseChanges: [
					{
						action: "updated",
						licensePlanId: "seat",
						version: 4,
						included: 10,
						previousAttributes: { included: 5 },
						planChange: null,
					},
				],
			}),
		],
	});
	expect(out).toContain("~ seat@v4  (license)");
	expect(out).toContain("~ Included: 5 -> 10");
});

test("reads feature previous_attributes with snake_case keys, not camelCase", () => {
	const out = render({
		features: [
			{
				featureId: "api_calls",
				action: "update",
				name: "API Calls",
				previousAttributes: {
					type: "single_use",
					consumable: true,
					credit_schema: null,
				},
			},
		],
		plans: [],
	});
	expect(out).toContain('~ Type: was "single_use"');
	expect(out).toContain("~ Consumable: was true");
	expect(out).toContain("+ Credit schema: added");
	const miscased = render({
		features: [
			{ featureId: "api_calls", action: "update", previousAttributes: null },
		],
		plans: [],
	});
	expect(miscased).not.toContain("Type:");
});

test("prints nothing extra for a create or delete row without a plan change", () => {
	const out = render({
		features: [],
		plans: [
			{
				planId: "pro_annual",
				version: 1,
				action: "create",
				name: "Pro (Annual)",
			},
			{ planId: "legacy", version: 1, action: "delete", name: "Legacy Plan" },
		],
	});
	expect(out).toContain("+ pro_annual@v1  Pro (Annual)");
	expect(out).toContain("- legacy@v1  Legacy Plan");
	expect(out).not.toContain("Name:");
	expect(out).not.toContain("Price:");
});
