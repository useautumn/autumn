/**
 * Rename + price change must rewrite execute-plan public ids to the new id.
 * Reward migration looks up via ProductService.getFull (no alias resolve).
 *
 * Red (current): results.plans[].id stays the old id after pro → proNew.
 * Green (after): results.plans[].id is proNew; getFull(proNew) finds the row.
 */

import { expect, test } from "bun:test";
import { isFixedPrice } from "@autumn/shared";
import { expectCatalogResultsCorrect } from "@tests/integration/catalog-v2/utils/expectCatalogUpdate.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { deleteDbPlans } from "../utils/expectCatalogPlans.js";
import { deleteAliases } from "../utils/planAliasTestUtils.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 rename: results.plans id and getFull use the new id after rename+price")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_stale");
		const newPlanId = uniqueTestId("cv2_stale_new");
		const planIds = [planId, newPlanId];
		await deleteDbPlans({ ctx, planIds });
		await deleteAliases({ ctx, planIds });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Stale Source",
						price: { amount: 20, interval: "month" },
					},
				],
			});

			const response = await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						new_plan_id: newPlanId,
						price: { amount: 35, interval: "month" },
					},
				],
			});

			expectCatalogResultsCorrect({
				response,
				plans: [{ id: newPlanId, action: "update" }],
			});

			const after = await ProductService.getFull({
				db: ctx.db,
				idOrInternalId: newPlanId,
				orgId: ctx.org.id,
				env: ctx.env,
			});
			expect(after.id).toBe(newPlanId);
			expect(after.prices.find(isFixedPrice)?.config).toMatchObject({
				amount: 35,
			});
		} finally {
			await deleteAliases({ ctx, planIds });
			await deleteDbPlans({ ctx, planIds });
		}
	},
);
