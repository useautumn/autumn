import { ApiVersion } from "@api/versionUtils/ApiVersion";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange";
import type { z } from "zod/v4";
import type { ApiInvoiceV1 } from "../../others/apiInvoice/apiInvoiceV1";
import { transformInvoiceToV0 } from "../../others/apiInvoice/changes/V1.2_InvoiceChange";
import { ApiCustomerSchema } from "../apiCustomer";
import type { ApiTrialsUsedV1 } from "../components/apiTrialsUsed/apiTrialsUsedV1";
import { transformTrialsUsedToV0 } from "../components/apiTrialsUsed/changes/V1.2_TrialsUsedChange";
import { transformBalanceToCusFeatureV3 } from "../cusFeatures/changes/V1.2_CusFeatureChange";
import type { ApiCusFeatureV3 } from "../cusFeatures/previousVersions/apiCusFeatureV3";
import type { ApiSubscription } from "../cusPlans/apiSubscription";
import { transformSubscriptionToCusProductV3 } from "../cusPlans/changes/V1.2_CusPlanChange";
import type { ApiCusProductV3 } from "../cusPlans/previousVersions/apiCusProductV3";
import { CustomerLegacyDataSchema } from "../customerLegacyData";
import { ApiCustomerV3Schema } from "../previousVersions/apiCustomerV3";

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

	transformResponse: ({ input, legacyData, ctx }) => {
		const v3CusProducts: ApiCusProductV3[] = [
			...input.subscriptions,
			...input.scheduled_subscriptions,
		].map((subscription: ApiSubscription) => {
			const cusPlanLegacyData = legacyData?.cusProductLegacyData[
				subscription.plan_id
			]
				? {
						...legacyData?.cusProductLegacyData[subscription.plan_id],
					}
				: undefined;

			return transformSubscriptionToCusProductV3({
				input: subscription,
				legacyData: cusPlanLegacyData,
				ctx,
			});
		});

		v3CusProducts.sort((a, b) => {
			if (a.is_add_on === b.is_add_on) {
				return 0;
			}
			return a.is_add_on ? 1 : -1;
		});

		const v3_features: Record<string, ApiCusFeatureV3> = {};
		for (const [featureId, feature] of Object.entries(input.balances)) {
			v3_features[featureId] = transformBalanceToCusFeatureV3({
				input: feature,
			});
		}

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
			send_email_receipts: input.send_email_receipts,
			products: v3CusProducts,
			features: v3_features,

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
			billing_details: input.billing_details,
		} satisfies z.infer<typeof ApiCustomerV3Schema>;
	},
});
