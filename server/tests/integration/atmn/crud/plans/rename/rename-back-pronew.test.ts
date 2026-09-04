/**
 * atmn crud/plans/rename — rename back `proNew → pro` → the original id is reclaimed, proNew becomes the alias, the old alias dies (rename-plan-alias-reclaim)
 *
 * a rename is a changed planId on a row that carries internalId; aliases per catalog-v2/plans/aliases
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
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { listAliases } from "../../../../catalog-v2/plans/utils/planAliasTestUtils.js";

const activeInternalId = async ({
	ctx,
	planId,
}: {
	ctx: AutumnContext;
	planId: string;
}): Promise<string> => {
	const [product] = await ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		inIds: [planId],
	});
	if (!product) throw new Error(`No plan row for ${planId}`);
	return product.internal_id;
};

test.concurrent(
	`${chalk.yellowBright("rename back `proNew → pro` → the original id is reclaimed, proNew becomes the alias, the old alias dies (rename-plan-alias-reclaim)")}`,
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: "atmn_rename_reclaim@autumn.test" }),
			],
			config: `{
	plans: [
		plan({ planId: "pro", name: "Pro", price: { amount: 49, interval: "month" } }),
	],
}`,
		});

		try {
			await scenario.push();
			const internalId = await activeInternalId({
				ctx: scenario.ctx,
				planId: "pro",
			});

			scenario.writeConfig(
				atmnConfigSource({
					body: `{
	plans: [
		plan({ planId: "proNew", internalId: "${internalId}", name: "Pro" }),
	],
}`,
				}),
			);
			await scenario.push();
			expect(
				(
					await listAliases({ ctx: scenario.ctx, planIds: ["pro", "proNew"] })
				).map((row) => ({
					aliasId: row.alias_id,
					canonicalPlanId: row.canonical_plan_id,
				})),
			).toEqual([{ aliasId: "pro", canonicalPlanId: "proNew" }]);

			// Rename back — same row, same internalId, the original id returns.
			scenario.writeConfig(
				atmnConfigSource({
					body: `{
	plans: [
		plan({ planId: "pro", internalId: "${internalId}", name: "Pro" }),
	],
}`,
				}),
			);
			await scenario.push();

			expect(
				await ProductService.getFull({
					db: scenario.ctx.db,
					orgId: scenario.ctx.org.id,
					env: scenario.ctx.env,
					idOrInternalId: "pro",
				}),
			).toEqual(
				expect.objectContaining({ id: "pro", internal_id: internalId }),
			);

			// The old alias (pro → proNew) is gone; proNew is now the alias pointing
			// back at the reclaimed pro.
			const aliases = await listAliases({
				ctx: scenario.ctx,
				planIds: ["pro", "proNew"],
			});
			expect(
				aliases.map((row) => ({
					aliasId: row.alias_id,
					canonicalPlanId: row.canonical_plan_id,
				})),
			).toEqual([{ aliasId: "proNew", canonicalPlanId: "pro" }]);
		} finally {
			scenario.cleanup();
		}
	},
);
