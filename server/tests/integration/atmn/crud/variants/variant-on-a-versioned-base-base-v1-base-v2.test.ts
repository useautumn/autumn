/**
 * atmn crud/variants — variant on a versioned base [base v1, base v2] → hangs off the stated version
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import {
	atmnConfigSource,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";

for (const targetVersion of ["v1", "v2"] as const) {
	test.concurrent(
		`${chalk.yellowBright(`variant on a versioned base [base ${targetVersion}] → hangs off the stated version`)}`,
		async () => {
			const scenario = await initAtmnScenario({
				setup: [
					s.platform.create({
						userEmail: `${uniqueTestId("atmn")}@autumn.test`,
					}),
				],
				config: `{
	plans: [
		plan({ active: true, planId: "base", versionSlug: "v1", name: "Base", price: { amount: 49, interval: "month" } }),
	],
}`,
			});

			try {
				await scenario.push();
				scenario.writeConfig(
					atmnConfigSource({
						body: `{
	plans: [
		plan({ active: true, planId: "base", versionSlug: "v2", name: "Base", price: { amount: 59, interval: "month" } }),
	
		plan({ active: false, planId: "base", versionSlug: "v1", name: "Base", price: { amount: 49, interval: "month" } }),
	],
}`,
					}),
				);
				await scenario.push();

				const v1 = await ProductService.getFull({
					db: scenario.ctx.db,
					orgId: scenario.ctx.org.id,
					env: scenario.ctx.env,
					idOrInternalId: "base",
					version: 1,
				});
				const v2 = await ProductService.getFull({
					db: scenario.ctx.db,
					orgId: scenario.ctx.org.id,
					env: scenario.ctx.env,
					idOrInternalId: "base",
					version: 2,
				});
				const target = targetVersion === "v1" ? v1 : v2;

				// The variant nests under whichever specific version row is
				// addressed — the live row or a demoted one.
				const variantEntry = `plan({
			active: ${targetVersion === "v2"},
			planId: "base",
			versionSlug: "${targetVersion}",
			variants: [
				{
					variantPlanId: "variantHere",
					name: "Variant Here",
					versionSlug: "v1",
					customize: { price: { amount: 99, interval: "month" } },
				},
			],
		})`;
				scenario.writeConfig(
					atmnConfigSource({
						body:
							targetVersion === "v2"
								? `{
	plans: [
		${variantEntry},
	],
}`
								: `{
	plans: [
		plan({ active: true, planId: "base", versionSlug: "v2", name: "Base", price: { amount: 59, interval: "month" } }),
	
		${variantEntry},
	],
}`,
					}),
				);
				await scenario.push();

				const variant = await ProductService.getFull({
					db: scenario.ctx.db,
					orgId: scenario.ctx.org.id,
					env: scenario.ctx.env,
					idOrInternalId: "variantHere",
				});
				expect(variant.base_internal_product_id).toBe(target.internal_id);
				const other = targetVersion === "v1" ? v2 : v1;
				expect(variant.base_internal_product_id).not.toBe(other.internal_id);
			} finally {
				scenario.cleanup();
			}
		},
	);
}
