import { ApiVersion } from "@api/versionUtils/ApiVersion";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange";
import type { z } from "zod/v4";
import type { SharedContext } from "../../../types/sharedContext";
import { ApiCustomerSchema } from "../apiCustomer";
import { ApiCustomerV5Schema } from "../apiCustomerV5";
import type { ApiBalance } from "../cusFeatures/apiBalance";
import { balanceV1ToV0 } from "../cusFeatures/mappers/balanceV1ToV0";
import type { ApiSubscription } from "../cusPlans/apiSubscription";
import { apiPurchaseV0ToSubscriptionV0 } from "../cusPlans/mappers/apiPurchaseV0ToSubscriptionV0";
import { apiSubscriptionV1ToV0 } from "../cusPlans/mappers/apiSubscriptionV1ToV0";

export const V2_0_CustomerChange = defineVersionChange({
	name: "V2_0 Customer Change",
	newVersion: ApiVersion.V2_1,
	oldVersion: ApiVersion.V2_0,
	description: ["Balance and subscription schema transforms (V1 to V0)"],
	affectedResources: [AffectedResource.Customer],
	newSchema: ApiCustomerV5Schema,
	oldSchema: ApiCustomerSchema,
	affectsResponse: true,

	transformResponse: ({
		ctx,
		input,
	}: {
		ctx: SharedContext;
		input: z.infer<typeof ApiCustomerV5Schema>;
	}): z.infer<typeof ApiCustomerSchema> => {
		// Transform balances from V1 to V0
		const transformedBalances: Record<string, ApiBalance> = {};
		if (input.balances) {
			for (const [featureId, balance] of Object.entries(input.balances)) {
				transformedBalances[featureId] = balanceV1ToV0({ input: balance });
			}
		}

		// Transform and split subscriptions by status
		// V5 has all subs in one array with status field, V4 splits them into two arrays
		const allSubscriptions = input.subscriptions ?? [];

		const transformedSubscriptions: ApiSubscription[] = allSubscriptions
			.filter((sub) => sub.status !== "scheduled")
			.map((sub) => apiSubscriptionV1ToV0({ ctx, input: sub }));

		const transformedScheduledSubscriptions: ApiSubscription[] =
			allSubscriptions
				.filter((sub) => sub.status === "scheduled")
				.map((sub) => apiSubscriptionV1ToV0({ ctx, input: sub }));

		// Convert purchases to subscriptions and add to subscriptions array
		const purchasesAsSubscriptions: ApiSubscription[] = (
			input.purchases ?? []
		).map((purchase) => apiPurchaseV0ToSubscriptionV0({ ctx, input: purchase }));

		// Return V0 customer format (without purchases field)
		const { purchases: _purchases, ...rest } = input;

		return {
			...rest,
			subscriptions: [...transformedSubscriptions, ...purchasesAsSubscriptions],
			scheduled_subscriptions: transformedScheduledSubscriptions,
			balances: transformedBalances,
		};
	},
});
