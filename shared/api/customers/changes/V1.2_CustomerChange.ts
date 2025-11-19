import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import type { z } from "zod/v4";
import type { ApiInvoiceV1 } from "../../others/apiInvoice/apiInvoiceV1.js";
import { transformInvoiceToV0 } from "../../others/apiInvoice/changes/V1.2_InvoiceChange.js";
import { ApiCustomerSchema } from "../apiCustomer.js";
import type { ApiTrialsUsedV1 } from "../components/apiTrialsUsed/apiTrialsUsedV1.js";
import { transformTrialsUsedToV0 } from "../components/apiTrialsUsed/changes/V1.2_TrialsUsedChange.js";
import { transformBalanceToCusFeatureV3 } from "../cusFeatures/changes/V1.2_CusFeatureChange.js";
import type { ApiCusFeatureV3 } from "../cusFeatures/previousVersions/apiCusFeatureV3.js";
import type { ApiSubscription } from "../cusPlans/apiSubscription.js";
import { transformSubscriptionToCusProductV3 } from "../cusPlans/changes/V1.2_CusPlanChange.js";
import type { ApiCusProductV3 } from "../cusPlans/previousVersions/apiCusProductV3.js";
import { CustomerLegacyDataSchema } from "../customerLegacyData.js";
import { ApiCustomerV3Schema } from "../previousVersions/apiCustomerV3.js";
/**
 * V1_2_CustomerChange: Transforms customer response TO V1_2 format
 *
 * Applied when: targetVersion <= V1_2
 *
 * Breaking changes introduced in V2.0:
 *
 * 1. Products renamed to Plans:
 *    - V2.0+: "products" field contains ApiCusPlan objects
 *    - V1.2: "products" field contains ApiCusProductV3 objects
 *
 * 2. Simplified feature schema:
 *    - V2.0+: Minimal fields with optional feature object
 *    - V1.2: Verbose fields with all metadata
 *
 * 3. Features remain as record (no change from V1.1):
 *    - Both V2.0 and V1.2: Record<string, ApiCusFeature>
 *
 * Input: ApiCustomer (V2.0+ format)
 * Output: ApiCustomerV3 (V1.2 format)
 */

export const V1_2_CustomerChange = defineVersionChange({
	newVersion: ApiVersion.V2_0,
	oldVersion: ApiVersion.V1_Beta,
	description: [
		"Products renamed to plans in SDK",
		"Simplified feature and plan schemas",
		"Added optional nested objects for expanded data",
	],
	affectedResources: [AffectedResource.Customer],
	newSchema: ApiCustomerSchema,
	oldSchema: ApiCustomerV3Schema,
	legacyDataSchema: CustomerLegacyDataSchema,

	// Response: V2.0 → V1.2
	transformResponse: ({ input, legacyData }) => {
		// Step 1: Transform plans V2.0 → V1.2 (products)
		const v3CusProducts: ApiCusProductV3[] = input.subscriptions.map(
			(subscription: ApiSubscription) =>
				transformSubscriptionToCusProductV3({
					input: subscription,
					legacyData: legacyData?.cusProductLegacyData[subscription.plan_id],
				}),
		);

		// Step 2: Transform features V2.0 → V1.2
		const v3_features: Record<string, ApiCusFeatureV3> = {};
		for (const [featureId, feature] of Object.entries(input.balances)) {
			v3_features[featureId] = transformBalanceToCusFeatureV3({
				input: feature,
				legacyData: legacyData?.cusFeatureLegacyData[featureId],
			});
		}

		// Step 3: Return V1.2 customer format
		return {
			autumn_id: input.autumn_id,
			id: input.id,
			name: input.name,
			email: input.email,
			created_at: input.created_at,
			fingerprint: input.fingerprint,
			stripe_id: input.stripe_id,
			env: input.env,
			metadata: input.metadata,
			products: v3CusProducts,
			features: v3_features,

			// The others
			invoices:
				input.invoices?.map((invoice: ApiInvoiceV1) =>
					transformInvoiceToV0({ input: invoice }),
				) ?? undefined,
			entities: input.entities ?? undefined,
			trials_used:
				input.trials_used?.map((trial: ApiTrialsUsedV1) =>
					transformTrialsUsedToV0({ input: trial }),
				) ?? undefined,
			rewards: input.rewards ?? undefined,
			referrals: input.referrals ?? undefined,
			payment_method: input.payment_method ?? undefined,
		} satisfies z.infer<typeof ApiCustomerV3Schema>;
	},
});
