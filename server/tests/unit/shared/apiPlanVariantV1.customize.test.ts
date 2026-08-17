import { describe, expect, test } from "bun:test";
import { CustomizePlanV1Schema, VariantCustomizeSchema } from "@autumn/shared";

describe("VariantCustomizeSchema", () => {
	test("accepts a license-only overlay", () => {
		expect(() =>
			VariantCustomizeSchema.parse({
				remove_licenses: [{ license_plan_id: "qa-2p-seat" }],
			}),
		).not.toThrow();
		expect(() =>
			CustomizePlanV1Schema.parse({
				remove_licenses: [{ license_plan_id: "qa-2p-seat" }],
			}),
		).not.toThrow();
	});
});
