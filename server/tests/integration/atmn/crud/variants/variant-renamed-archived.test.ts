/**
 * atmn crud/variants — variant [renamed, archived]
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
import { listAliases } from "../../../catalog-v2/plans/utils/planAliasTestUtils.js";

const baseConfig = `{
	plans: [
		plan({
			planId: "base",
			name: "Base",
			price: { amount: 49, interval: "month" },
			variants: [
				{
					variantPlanId: "addon",
					name: "Addon",
					customize: { price: { amount: 79, interval: "month" } },
				},
			],
		}),
	],
}`;

for (const action of ["renamed", "archived"] as const) {
	test.concurrent(`${chalk.yellowBright(`variant ${action}`)}`, async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `atmn_variant_${action}@autumn.test` }),
			],
			config: baseConfig,
		});

		try {
			await scenario.push();
			const before = await ProductService.getFull({
				db: scenario.ctx.db,
				orgId: scenario.ctx.org.id,
				env: scenario.ctx.env,
				idOrInternalId: "addon",
			});

			const variantEdit =
				action === "renamed"
					? `{ variantPlanId: "addon", newPlanId: "addonNew" }`
					: `{ variantPlanId: "addon", archived: true }`;
			scenario.writeConfig(
				atmnConfigSource({
					body: `{
	plans: [
		plan({
			planId: "base",
			variants: [
				${variantEdit},
			],
		}),
	],
}`,
				}),
			);
			await scenario.push();

			if (action === "renamed") {
				const renamed = await ProductService.getFull({
					db: scenario.ctx.db,
					orgId: scenario.ctx.org.id,
					env: scenario.ctx.env,
					idOrInternalId: "addonNew",
				});
				expect(renamed.internal_id).toBe(before.internal_id);
				expect(renamed.base_internal_product_id).toBe(
					before.base_internal_product_id,
				);

				const aliases = await listAliases({
					ctx: scenario.ctx,
					planIds: ["addon", "addonNew"],
				});
				expect(
					aliases.map((row) => ({
						aliasId: row.alias_id,
						canonicalPlanId: row.canonical_plan_id,
					})),
				).toEqual([{ aliasId: "addon", canonicalPlanId: "addonNew" }]);
			} else {
				const archived = await ProductService.getFull({
					db: scenario.ctx.db,
					orgId: scenario.ctx.org.id,
					env: scenario.ctx.env,
					idOrInternalId: "addon",
				});
				expect(archived.internal_id).toBe(before.internal_id);
				expect(archived.archived).toBe(true);
				expect(archived.base_internal_product_id).toBe(
					before.base_internal_product_id,
				);
			}
		} finally {
			scenario.cleanup();
		}
	});
}
