import { describe, expect, test } from "bun:test";
import type { Feature, ProductItem } from "@autumn/shared";
import { billingUnitsLabel } from "@/views/products/plan/utils/billingUnitsUtils";

const feature = (display: Feature["display"]) =>
	({ id: "users", name: "Users", display }) as Feature;

describe("billingUnitsLabel", () => {
	test.each([
		{ display: null, units: 1, label: "per user" },
		{ display: null, units: 100, label: "per 100 users" },
		{
			display: { singular: "seat", plural: "seats" },
			units: 1,
			label: "per seat",
		},
	])("$label", ({ display, units, label }) => {
		expect(
			billingUnitsLabel({
				item: { feature_id: "users", billing_units: units } as ProductItem,
				features: [feature(display)],
			}),
		).toBe(label);
	});
});
