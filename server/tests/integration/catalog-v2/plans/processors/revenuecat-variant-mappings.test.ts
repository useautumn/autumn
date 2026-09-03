/**
 * catalogV2.update — a RevenueCat mapping stated on a VARIANT is persisted.
 *
 * `revenuecat_mappings` is keyed (org_id, env, autumn_product_id) where
 * autumn_product_id is the public PLAN ID string — there is no version
 * dimension and no base/variant dimension, so a variant is its own plan and
 * legitimately owns its own mapping row. `CatalogVariantParamsSchema` shares
 * `ApiPlanProcessorsSchema`, so a variant entry accepts `processors.revenuecat`
 * and the Stripe half of it was already applied — but intentToUpsertProductPlan
 * only carried `revenuecatProcessor` for `source === "direct"`, so the variant
 * lanes dropped it and the request succeeded having written nothing.
 *
 * Contract:
 *   RV1  a variant CREATE (`variant_link`) persists its stated RC mapping
 *   RV2  an existing variant EDIT (`variant_propagation`) persists it too
 *   RV3  the variant's mapping is its own — the base plan is unaffected
 *
 * Red (before): the variant's `processors.revenuecat` is undefined on GET.
 * Green (after): both lanes echo the stated products.
 */

import { expect, test } from "bun:test";
import type { ApiPlanExpandedV1 } from "@autumn/shared";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import {
	messagesItem,
	withCatalogPlans,
} from "../licenses/utils/seedLicensePlans.js";

const mappedIds = async ({
	autumn,
	planId,
}: {
	autumn: AutumnInt;
	planId: string;
}): Promise<string[] | undefined> => {
	const catalog = await autumn.catalogV2.get({});
	// Variants never surface top-level (getCatalogV2 filters them out); they hang
	// off their base as `variants[].plan`, so look there before giving up.
	const plan = (catalog.plans.find(
		(row: { id: string }) => row.id === planId,
	) ??
		catalog.plans
			.flatMap(
				(row: { variants?: { variant_plan_id: string; plan?: unknown }[] }) =>
					row.variants ?? [],
			)
			.find((variant) => variant.variant_plan_id === planId)?.plan) as
		| ApiPlanExpandedV1
		| undefined;
	expect(plan, `GET catalog plan ${planId}`).toBeDefined();
	return plan?.processors?.revenuecat?.products.map(
		(product) => product.product_id,
	);
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 processors revenuecat: a variant owns its own mapping row")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_rc_variant_base");
		const variantId = uniqueTestId("cv2_rc_variant_eu");
		const createdId = `rc_${variantId}_created`;
		const editedId = `rc_${variantId}_edited`;

		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId],
			run: async () => {
				// RV1: stated on the variant CREATE entry — the variant_link lane.
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: baseId,
							name: "RC Variant Base",
							items: [messagesItem(100)],
							variants: [
								{
									variant_plan_id: variantId,
									name: "RC Variant EU",
									processors: {
										revenuecat: { products: [{ product_id: createdId }] },
									},
								},
							],
						},
					],
				});
				expect(
					await mappedIds({ autumn: autumnV2_3, planId: variantId }),
					"variant_link persists the stated mapping",
				).toEqual([createdId]);

				// RV3: the mapping belongs to the variant, not to the base.
				expect(
					await mappedIds({ autumn: autumnV2_3, planId: baseId }),
					"base plan has no mapping of its own",
				).toBeUndefined();

				// RV2: restated on the existing variant — the variant_propagation lane.
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: baseId,
							variants: [
								{
									variant_plan_id: variantId,
									processors: {
										revenuecat: { products: [{ product_id: editedId }] },
									},
								},
							],
						},
					],
				});
				expect(
					await mappedIds({ autumn: autumnV2_3, planId: variantId }),
					"variant_propagation persists the stated mapping",
				).toEqual([editedId]);
			},
		});
	},
);
