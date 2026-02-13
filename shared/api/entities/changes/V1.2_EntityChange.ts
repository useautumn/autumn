import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import type { z } from "zod/v4";
import { transformBalanceToCusFeatureV3 } from "../../customers/cusFeatures/changes/V1.2_CusFeatureChange.js";
import type { ApiCusFeatureV3 } from "../../customers/cusFeatures/previousVersions/apiCusFeatureV3.js";
import type { ApiSubscription } from "../../customers/cusPlans/apiSubscription.js";
import { transformSubscriptionToCusProductV3 } from "../../customers/cusPlans/changes/V1.2_CusPlanChange.js";
import type { ApiCusProductV3 } from "../../customers/cusPlans/previousVersions/apiCusProductV3.js";
import type { ApiInvoiceV1 } from "../../others/apiInvoice/apiInvoiceV1.js";
import { transformInvoiceToV0 } from "../../others/apiInvoice/changes/V1.2_InvoiceChange.js";
import { ApiEntityV1Schema } from "../apiEntity.js";
import { EntityLegacyDataSchema } from "../entityLegacyData.js";
import { ApiEntityV0Schema } from "../prevVersions/apiEntityV0.js";

/**
 * V1_2_EntityChange: Transforms entity response TO V0 format (pre-V2.0)
 *
 * Applied when: targetVersion <= V1_2
 *
 * Breaking changes introduced in V2.0:
 *
 * 1. Products renamed to Plans:
 *    - V1+: "subscriptions" field contains ApiSubscription objects
 *    - V0: "products" field contains ApiCusProductV3 objects
 *
 * 2. Simplified feature schema:
 *    - V1+: "balances" field with minimal fields + optional feature object
 *    - V0: "features" field with verbose fields and all metadata
 *
 * 3. Features remain as record (no change from V1.1):
 *    - Both V1 and V0: Record<string, ApiCusFeature>
 *
 * Input: ApiEntityV1 (V2.0+ format)
 * Output: ApiEntityV0 (V1.2 format)
 */

export const V1_2_EntityChange = defineVersionChange({
	newVersion: ApiVersion.V2_0,
	oldVersion: ApiVersion.V1_Beta,
	description: [
		"Products renamed to plans in SDK",
		"Simplified feature and plan schemas",
		"Added optional nested objects for expanded data",
	],
	affectedResources: [AffectedResource.Entity],
	newSchema: ApiEntityV1Schema,
	oldSchema: ApiEntityV0Schema,
	legacyDataSchema: EntityLegacyDataSchema,

	// Response: V1 → V0
	transformResponse: ({ input, legacyData, ctx }) => {
		// Step 1: Transform plans V1 → V0 (products)
		const v0CusProducts: ApiCusProductV3[] | undefined = input.subscriptions
			? input.subscriptions.map((subscription: ApiSubscription) => {
					const cusPlanLegacyData = legacyData?.cusProductLegacyData[
						subscription.plan_id
					]
						? {
								...legacyData?.cusProductLegacyData[subscription.plan_id],
								features: ctx?.features || [],
							}
						: undefined;

					return transformSubscriptionToCusProductV3({
						input: subscription,
						legacyData: cusPlanLegacyData,
						ctx,
					});
				})
			: undefined;

		const scheduledCusProducts: ApiCusProductV3[] | undefined =
			input.scheduled_subscriptions
				? input.scheduled_subscriptions.map((subscription: ApiSubscription) => {
						const cusPlanLegacyData = legacyData?.cusProductLegacyData[
							subscription.plan_id
						]
							? {
									...legacyData?.cusProductLegacyData[subscription.plan_id],
									features: ctx?.features || [],
								}
							: undefined;

						return transformSubscriptionToCusProductV3({
							input: subscription,
							legacyData: cusPlanLegacyData,
							ctx,
						});
					})
				: undefined;

		const finalCusProducts = [
			...(v0CusProducts || []),
			...(scheduledCusProducts || []),
		];

		// Step 2: Transform features V1 → V0
		let v0_features: Record<string, ApiCusFeatureV3> | undefined;
		if (input.balances) {
			v0_features = {};
			for (const [featureId, feature] of Object.entries(input.balances)) {
				v0_features[featureId] = transformBalanceToCusFeatureV3({
					input: feature,
				});
			}
		}

		// Step 3: Return V0 entity format
		return {
			autumn_id: input.autumn_id,
			id: input.id,
			name: input.name,
			customer_id: input.customer_id,
			feature_id: input.feature_id,
			created_at: input.created_at,
			env: input.env,
			products: finalCusProducts,
			features: v0_features,
			invoices:
				input.invoices?.map((invoice: ApiInvoiceV1) =>
					transformInvoiceToV0({ input: invoice }),
				) ?? undefined,
		} satisfies z.infer<typeof ApiEntityV0Schema>;
	},
});
