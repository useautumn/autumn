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

	transformResponse: ({ input, legacyData, ctx }) => {
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

		let v0_features: Record<string, ApiCusFeatureV3> | undefined;
		if (input.balances) {
			v0_features = {};
			for (const [featureId, feature] of Object.entries(input.balances)) {
				v0_features[featureId] = transformBalanceToCusFeatureV3({
					input: feature,
				});
			}
		}

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
