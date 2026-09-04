/**
 * atmn crud/variants — top-level row with baseVariantId → server refuses, error surfaced
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
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
					userEmail: "atmn_toplevel_basevariantid@autumn.test",
				}),
			],
			config: `{
	plans: [
		plan({ planId: "base", name: "Base", price: { amount: 49, interval: "month" } }),
	],
}`,
		});

		try {
			await scenario.push();

			// A variant belongs under its base's `variants[]`; declaring it as a
			// sibling top-level row with `baseVariantId` is not the same call
			// shape, and the section note says variants stay nested.
			scenario.writeConfig(
				atmnConfigSource({
					body: `{
	plans: [
		plan({
			planId: "sneakyVariant",
			name: "Sneaky Variant",
			baseVariantId: "base",
			price: { amount: 59, interval: "month" },
		}),
	],
}`,
				}),
			);

			// Decision pending: exact error shape isn't pinned down here.
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
