import { describe, expect, test } from "bun:test";
import type { ApiPlan, ApiProduct, CreatePlanParams } from "@autumn/shared";
import chalk from "chalk";
import { AutumnCliV2 } from "@/external/autumn/autumnCliV2.js";

describe(chalk.yellowBright("Plan V2 - Add-on & Default Flags Tests"), () => {
	const autumnV2 = new AutumnCliV2({ version: "2.0.0" });
	const autumnV1_2 = new AutumnCliV2({ version: "1.2.0" });

	test("CREATE: add_on and default flags", async () => {
		const productId = "flags_test";
		try {
			await autumnV2.products.delete(productId);
		} catch (_error) {}

		const created = (await autumnV2.products.create({
			id: "flags_test",
			name: "Flags Test",
			add_on: true,
			default: false,
		} as CreatePlanParams)) as ApiPlan;

		// V2 response validation
		expect(created.add_on).toBe(true);
		expect(created.default).toBe(false);

		// V1.2 validation (items format)
		const v1_2 = (await autumnV1_2.products.get("flags_test")) as ApiProduct;
		expect(v1_2.is_add_on).toBe(true);
		expect(v1_2.is_default).toBe(false);
	});
});
