import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import {
	atmnConfigSource,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";

test.concurrent(
	`${chalk.yellowBright("top-level row with baseVariantId → server refuses, error surfaced")}`,
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({
					userEmail: `${uniqueTestId("atmn")}@autumn.test`,
				}),
			],
			config: `{
	plans: [
		plan({ active: true, planId: "base", name: "Base", versionSlug: "v1", price: { amount: 49, interval: "month" } }),
	],
}`,
		});

		try {
			await scenario.push();

			scenario.writeConfig(
				atmnConfigSource({
					body: `{
	plans: [
		plan({
			active: true,
			planId: "sneakyVariant",
			name: "Sneaky Variant",
			versionSlug: "v1",
			baseVariantId: "base",
			price: { amount: 59, interval: "month" },
		}),
	],
}`,
				}),
			);

			await expect(scenario.push()).rejects.toThrow();

			expect(
				await ProductService.listFull({
					db: scenario.ctx.db,
					orgId: scenario.ctx.org.id,
					env: scenario.ctx.env,
					inIds: ["sneakyVariant"],
					returnAll: true,
				}),
			).toEqual([]);
		} finally {
			scenario.cleanup();
		}
	},
);
