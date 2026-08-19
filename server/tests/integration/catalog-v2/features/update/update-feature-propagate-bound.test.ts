/**
 * catalogV2.update — bounded reference rewrites.
 *
 * Contract: id/type/usage_type changes that would rewrite more than
 * FEATURE_REWRITE_ROW_LIMIT entitlements or prices throw. Name-only updates
 * never count/propagate, so many entitlements do not block them.
 */

import { test } from "bun:test";
import {
	AllowanceType,
	type Entitlement,
	EntInterval,
	FeatureType,
} from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { FEATURE_REWRITE_ROW_LIMIT } from "@/internal/features/repos/featureReferenceRewriteScopes.js";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService.js";
import { generateId } from "@/utils/genUtils.js";
import {
	deleteDbFeatures,
	expectDbFeaturesCorrect,
} from "../../utils/expectCatalogFeatures.js";
import { expectCatalogResultsCorrect } from "../../utils/expectCatalogUpdate.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";

const meteredFeature = ({
	featureId,
	name = "CatalogV2 Bound Feature",
}: {
	featureId: string;
	name?: string;
}) => ({
	feature_id: featureId,
	name,
	type: FeatureType.Metered,
	consumable: true,
});

test.concurrent(
	`${chalk.yellowBright(`catalogV2 rewrite bound: ${FEATURE_REWRITE_ROW_LIMIT + 1} entitlements blocks type change; name-only still works`)}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const featureId = uniqueTestId("cv2_bound_ents");
		await deleteDbFeatures({ ctx, featureIds: [featureId] });

		try {
			await autumnV2_3.catalogV2.update({
				features: [meteredFeature({ featureId })],
			});

			const dbFeature = await FeatureService.get({
				db: ctx.db,
				id: featureId,
				orgId: ctx.org.id,
				env: ctx.env,
			});
			if (!dbFeature?.internal_id) {
				throw new Error(`expected ${featureId} in DB`);
			}

			const looseEntitlements: Entitlement[] = Array.from(
				{ length: FEATURE_REWRITE_ROW_LIMIT + 1 },
				() => ({
					id: generateId("ent"),
					created_at: Date.now(),
					internal_feature_id: dbFeature.internal_id,
					internal_product_id: null,
					org_id: ctx.org.id,
					feature_id: featureId,
					allowance_type: AllowanceType.Fixed,
					allowance: 10,
					interval: EntInterval.Month,
					interval_count: 1,
					is_custom: false,
					carry_from_previous: false,
					entity_feature_id: null,
					pooled: false,
					usage_limit: null,
				}),
			);
			await EntitlementService.insert({
				db: ctx.db,
				data: looseEntitlements,
			});

			await expectAutumnError({
				errCode: "invalid_feature",
				errMessage: "too many entitlements",
				func: () =>
					autumnV2_3.catalogV2.update({
						features: [
							{
								feature_id: featureId,
								name: "CatalogV2 Bound Feature",
								type: FeatureType.Boolean,
							},
						],
					}),
			});

			expectCatalogResultsCorrect({
				response: await autumnV2_3.catalogV2.update({
					features: [
						meteredFeature({ featureId, name: "CatalogV2 Bound Renamed" }),
					],
				}),
				features: [{ id: featureId, action: "update" }],
			});
			await expectDbFeaturesCorrect({
				ctx,
				expected: [{ id: featureId, type: FeatureType.Metered }],
			});
		} finally {
			await deleteDbFeatures({ ctx, featureIds: [featureId] });
		}
	},
);
