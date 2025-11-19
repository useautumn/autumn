import { describe, expect, test } from "bun:test";
import type { ApiPlan, ApiProduct, CreatePlanParams } from "@autumn/shared";
import chalk from "chalk";
import { AutumnCliV2 } from "@/external/autumn/autumnCliV2.js";

describe(chalk.yellowBright("Plan V2 - Basic CREATE Tests"), () => {
	const autumnV2 = new AutumnCliV2({ version: "2.0.0" });
	const autumnV1_2 = new AutumnCliV2({ version: "1.2.0" });

	test("CREATE: minimal plan (id + name only)", async () => {
		const productId = "min_plan";
		try {
			await autumnV2.products.delete(productId);
		} catch (_error) {}

		const created = (await autumnV2.products.create({
			id: "min_plan",
			name: "Minimal Plan",
		} as CreatePlanParams)) as ApiPlan;

		// V2 response validation
		expect(created.id).toBe("min_plan");
		expect(created.features).toHaveLength(0);

		// V1.2 validation (using items format)
		const v1_2 = (await autumnV1_2.products.get("min_plan")) as ApiProduct;
		expect(v1_2.items).toHaveLength(0);
		expect(v1_2.is_add_on).toBe(false);
	});

	test("CREATE: description field (V2 only)", async () => {
		const productId = "with_desc";
		try {
			await autumnV2.products.delete(productId);
		} catch (_error) {}

		const created = (await autumnV2.products.create({
			id: "with_desc",
			name: "With Description",
			description: "Test description for V2",
		} as CreatePlanParams)) as ApiPlan;

		// V2 response validation
		expect(created.description).toBe("Test description for V2");

		// V1.2 validation - description not in V1.2 schema
		const v1_2 = (await autumnV1_2.products.get("with_desc")) as ApiProduct;
		// @ts-expect-error: Descriptions aren't in the type, but we're just double checking the response.
		expect(v1_2.description).toBeUndefined();
	});
});
