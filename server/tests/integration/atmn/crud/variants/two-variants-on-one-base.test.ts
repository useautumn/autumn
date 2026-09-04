/**
 * atmn crud/variants — two variants on one base
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import type { ApiPlanV1 } from "@autumn/shared";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";

test.concurrent(
	`${chalk.yellowBright("two variants on one base")}`,
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: "atmn_two_variants@autumn.test" }),
			],
			config: `{
	plans: [
		plan({
			planId: "base",
			name: "Base",
			price: { amount: 49, interval: "month" },
			variants: [
				{
					variantPlanId: "variantA",
					name: "Variant A",
					customize: { price: { amount: 59, interval: "month" } },
				},
				{
					variantPlanId: "variantB",
					name: "Variant B",
					customize: { price: { amount: 99, interval: "month" } },
				},
			],
		}),
	],
}`,
		});

		try {
			await scenario.push();

			const base = await ProductService.getFull({
				db: scenario.ctx.db,
				orgId: scenario.ctx.org.id,
				env: scenario.ctx.env,
				idOrInternalId: "base",
			});
			for (const variantId of ["variantA", "variantB"]) {
				const variant = await ProductService.getFull({
					db: scenario.ctx.db,
					orgId: scenario.ctx.org.id,
					env: scenario.ctx.env,
					idOrInternalId: variantId,
				});
				expect(variant.base_internal_product_id).toBe(base.internal_id);
			}

			const variantA =
				await scenario.autumnV2_3.products.get<ApiPlanV1>("variantA");
			const variantB =
				await scenario.autumnV2_3.products.get<ApiPlanV1>("variantB");
			expect(variantA.price).toEqual(expect.objectContaining({ amount: 59 }));
			expect(variantB.price).toEqual(expect.objectContaining({ amount: 99 }));

			// Re-pushing the unchanged config previews nothing to apply.
			const wire = await scenario.wireFromConfig();
			const preview = (await scenario.client.previewUpdate(wire)) as {
				plans?: Array<{ action?: string }>;
			};
			expect(
				(preview.plans ?? []).filter(
					(row) => row.action !== undefined && row.action !== "none",
				),
			).toEqual([]);
		} finally {
			scenario.cleanup();
		}
	},
);
