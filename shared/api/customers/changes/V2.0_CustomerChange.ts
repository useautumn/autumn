import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import type { z } from "zod/v4";
import { ApiCustomerSchema } from "../apiCustomer.js";
import { ApiCustomerV5Schema } from "../apiCustomerV5.js";
import type { ApiBalance } from "../cusFeatures/apiBalance.js";
import { balanceV1ToV0 } from "../cusFeatures/mappers/balanceV1ToV0.js";
import type { ApiSubscription } from "../cusPlans/apiSubscription.js";
import { apiSubscriptionV1ToV0 } from "../cusPlans/mappers/apiSubscriptionV1ToV0.js";
import { CustomerLegacyDataSchema } from "../customerLegacyData.js";

export const V2_0_CustomerChange = defineVersionChange({
	name: "V2_0 Customer Change",
	newVersion: ApiVersion.V2_1,
	oldVersion: ApiVersion.V2_0,
	description: ["Balance and subscription schema transforms (V1 to V0)"],
	affectedResources: [AffectedResource.Customer],
	newSchema: ApiCustomerV5Schema,
	oldSchema: ApiCustomerSchema,
	legacyDataSchema: CustomerLegacyDataSchema,
	affectsResponse: true,

	transformResponse: ({
		input,
		legacyData,
	}: {
		input: z.infer<typeof ApiCustomerV5Schema>;
		legacyData?: z.infer<typeof CustomerLegacyDataSchema>;
	}): z.infer<typeof ApiCustomerSchema> => {
		// Transform balances from V1 to V0
		const transformedBalances: Record<string, ApiBalance> = {};
		if (input.balances) {
			for (const [featureId, balance] of Object.entries(input.balances)) {
				// Get per-feature legacy data for this balance
				const featureLegacyData = legacyData?.cusFeatureLegacyData?.[featureId];
				transformedBalances[featureId] = balanceV1ToV0({
					input: balance,
					legacyData: featureLegacyData,
				});
			}
		}

		// Transform and split subscriptions by status
		// V5 has all subs in one array with status field, V4 splits them into two arrays
		const allSubscriptions = input.subscriptions ?? [];

		const transformedSubscriptions: ApiSubscription[] = allSubscriptions
			.filter((sub) => sub.status !== "scheduled")
			.map((sub) => apiSubscriptionV1ToV0({ input: sub }));

		const transformedScheduledSubscriptions: ApiSubscription[] =
			allSubscriptions
				.filter((sub) => sub.status === "scheduled")
				.map((sub) => apiSubscriptionV1ToV0({ input: sub }));

		// Return V0 customer format (without purchases field)
		const { purchases: _purchases, ...rest } = input;

		return {
			...rest,
			subscriptions: transformedSubscriptions,
			scheduled_subscriptions: transformedScheduledSubscriptions,
			balances: transformedBalances,
		};
	},
});
