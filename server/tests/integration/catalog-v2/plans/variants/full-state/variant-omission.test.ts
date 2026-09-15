/**
 * Full-state variant declarations account for each variant version.
 *
 * Red (current): a nested variant version omitted from the payload produces no
 * removal, and customer-held single versions would be archived independently.
 * Green (after): omission deletes the exact unused row and rejects partial archive.
 */

import { expect, test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";
import { expectCatalogPreviewCorrect } from "../../../utils/expectCatalogUpdate.js";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { withCatalogPlans } from "../../licenses/utils/seedLicensePlans.js";
import { seedVersionableCustomer } from "../../migrations/utils/seedVersionableCustomer.js";
import {
	expectVariantPlanCorrect,
	expectVariantPointerCorrect,
} from "../utils/expectVariantPointer.js";
import {
	seedBaseWithVariant,
	seedVariantNewVersion,
} from "../utils/seedVariantPlans.js";

const fullStateWithVariantV1 = ({
	baseId,
	variantId,
}: {
	baseId: string;
	variantId: string;
}) => ({
	plans: [
		{
			plan_id: baseId,
			variants: [{ variant_plan_id: variantId, version_slug: "v1" }],
		},
	],
	skip_deletions: false,
	skip_version_deletions: false,
	migration: { draft: true },
});

test.concurrent(
	`${chalk.yellowBright("catalogV2 variant full-state: omitted unused variant version previews and deletes exact row")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({
			setup: [
				s.platform.create({
					userEmail: `${uniqueTestId("var_omit")}@autumn.test`,
					setupDefaultFeatures: true,
				}),
			],
			actions: [],
		});
		const baseId = uniqueTestId("var_omit_base");
		const variantId = uniqueTestId("var_omit_eu");

		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId],
			run: async () => {
				await seedBaseWithVariant({ autumn: autumnV2_3, baseId, variantId });
				await seedVariantNewVersion({ autumn: autumnV2_3, variantId });
				const params = fullStateWithVariantV1({ baseId, variantId });

				expectCatalogPreviewCorrect({
					preview: await autumnV2_3.catalogV2.previewUpdate(params),
					plans: [
						{
							planId: variantId,
							version: 2,
							action: "delete",
							hasCustomers: false,
							willArchive: false,
						},
					],
				});

				await autumnV2_3.catalogV2.update(params);

				await expectVariantPointerCorrect({
					ctx,
					variantPlanId: variantId,
					variantVersion: 1,
					basePlanId: baseId,
					baseVersion: 1,
				});
				await expectVariantPlanCorrect({
					ctx,
					variantPlanId: variantId,
					version: 1,
				});
				const removed = await ProductService.getFull({
					db: ctx.db,
					idOrInternalId: variantId,
					orgId: ctx.org.id,
					env: ctx.env,
					version: 2,
					allowNotFound: true,
				});
				expect(removed).toBeNull();
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variant full-state: customer-held single version cannot be archived alone")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({
			setup: [
				s.platform.create({
					userEmail: `${uniqueTestId("var_omit_cus")}@autumn.test`,
					setupDefaultFeatures: true,
				}),
			],
			actions: [],
		});
		const baseId = uniqueTestId("var_omit_cus_base");
		const variantId = uniqueTestId("var_omit_cus_eu");

		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId],
			run: async () => {
				await seedBaseWithVariant({ autumn: autumnV2_3, baseId, variantId });
				await seedVariantNewVersion({ autumn: autumnV2_3, variantId });
				await seedVersionableCustomer({ ctx, planId: variantId, version: 2 });
				const params = fullStateWithVariantV1({ baseId, variantId });

				for (const func of [
					() => autumnV2_3.catalogV2.previewUpdate(params),
					() => autumnV2_3.catalogV2.update(params),
				]) {
					await expectAutumnError({
						errCode: ErrCode.InvalidRequest,
						errMessage: `${variantId} v2 still has customers. Either expire or migrate them and delete the version, or archive all versions of ${variantId}`,
						func,
					});
				}

				await expectVariantPointerCorrect({
					ctx,
					variantPlanId: variantId,
					variantVersion: 2,
					basePlanId: baseId,
					baseVersion: 1,
				});
			},
		});
	},
);
