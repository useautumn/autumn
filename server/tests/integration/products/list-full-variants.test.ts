/**
 * listFull variants[] — every version pointing at that base row.
 *
 * Contract:
 *   pro v1 and pro v2 both with base_internal_product_id = baseV1
 *   → listFull(base) includes both on baseV1.variants
 */

import { expect, test } from "bun:test";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { messagesItem } from "@tests/integration/catalog-v2/plans/licenses/utils/seedLicensePlans.js";
import { deleteDbPlans } from "@tests/integration/catalog-v2/plans/utils/expectCatalogPlans.js";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import { ProductService } from "@/internal/products/ProductService.js";

test.concurrent(
	`${chalk.yellowBright("listFull: base.variants includes every version pointing at that row")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("lf_var_base");
		const variantId = uniqueTestId("lf_var_pro");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						name: "Base",
						items: [messagesItem(100)],
						variants: [{ variant_plan_id: variantId, name: "Pro" }],
					},
				],
			});
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: variantId,
						name: "Pro v2",
						versioning: "new_version",
					},
				],
			});

			const versions = await ProductService.listFull({
				db: ctx.db,
				orgId: ctx.org.id,
				env: ctx.env,
				inIds: [baseId],
				returnAll: true,
			});
			const baseV1 = versions.find((product) => product.version === 1);
			expect(baseV1).toBeDefined();
			const variantVersions = (baseV1?.variants ?? [])
				.filter((product) => product.id === variantId)
				.map((product) => product.version)
				.sort((a, b) => a - b);
			expect(variantVersions).toEqual([1, 2]);
			expect(
				(baseV1?.variants ?? []).every(
					(product) =>
						product.base_internal_product_id === baseV1?.internal_id,
				),
			).toBe(true);
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);
