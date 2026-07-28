import { describe, expect, test } from "bun:test";
import { AutoTopupSchema } from "./customerBillingControls";

describe("AutoTopupSchema", () => {
	test("allows a negative balance threshold", () => {
		expect(
			AutoTopupSchema.parse({
				feature_id: "credits",
				enabled: true,
				threshold: -350_000,
				quantity: 350_000,
			}),
		).toMatchObject({ threshold: -350_000 });
	});
});
