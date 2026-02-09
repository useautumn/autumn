import { describe, expect, test } from "bun:test";
import type { ApiPlan, ApiProduct, CreatePlanParams } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import chalk from "chalk";
import { AutumnCliV2 } from "@/external/autumn/autumnCliV2.js";

describe(chalk.yellowBright("Plan V2 - Boolean Feature Tests"), () => {
	const autumnV2 = new AutumnCliV2({ version: "2.0.0" });
	const autumnV1_2 = new AutumnCliV2({ version: "1.2.0" });

	test("CREATE: boolean feature", async () => {
		const productId = "bool_plan";
		try {
			await autumnV2.products.delete(productId);
		} catch (_error) {}

		const created = (await autumnV2.products.create({
			id: "bool_plan",
			name: "Boolean Plan",
			features: [{ feature_id: TestFeature.Dashboard }],
		} as CreatePlanParams)) as ApiPlan;

		// V2 response validation
		expect(created.features).toHaveLength(1);
		expect(created.features[0].feature_id).toBe(TestFeature.Dashboard);

		// V1.2 validation (items format)
		const v1_2 = (await autumnV1_2.products.get("bool_plan")) as ApiProduct;
		expect(v1_2.items[0].feature_id).toBe(TestFeature.Dashboard);
	});
});
