import { describe, expect, test } from "bun:test";
import { ApiPlanExpandedV1Schema, ApiPlanV1Schema } from "./apiPlanV1.js";

const cappedPrepaidItem = {
	feature_id: "messages",
	included: 0,
	price: {
		interval: "month",
		billing_units: 1,
		billing_method: "prepaid",
		tiers: [{ to: 10, amount: 10 }],
	},
};

const licenseCustomize = { add_items: [cappedPrepaidItem] };

const customize = {
	add_items: [cappedPrepaidItem],
	upsert_licenses: [{ license_plan_id: "seat", customize: licenseCustomize }],
};

const plan = {
	id: "pro_variant",
	name: "Pro Variant",
	description: null,
	group: null,
	version: 1,
	add_on: false,
	auto_enable: false,
	price: null,
	items: [],
	created_at: 1771513979217,
	env: "sandbox",
	archived: false,
	base_variant_id: null,
	config: {},
	metadata: {},
};

describe("ApiPlanV1 response customize", () => {
	test("parses stored tiers that create-time rules reject", () => {
		expect(() =>
			ApiPlanV1Schema.parse({
				...plan,
				variant_details: { base_plan_id: "pro", customize },
			}),
		).not.toThrow();

		expect(() =>
			ApiPlanExpandedV1Schema.parse({
				...plan,
				variants: [
					{ variant_plan_id: "pro_variant", name: "Pro Variant", customize },
				],
				licenses: [
					{
						license_plan_id: "seat",
						version: 1,
						included: 1,
						prepaid_only: true,
						customize: licenseCustomize,
					},
				],
			}),
		).not.toThrow();
	});
});
