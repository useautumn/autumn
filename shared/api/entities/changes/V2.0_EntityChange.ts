import type { ApiBalance } from "@api/customers/cusFeatures/apiBalance";
import { balanceV1ToV0 } from "@api/customers/cusFeatures/mappers/balanceV1ToV0";
import { ApiVersion } from "@api/versionUtils/ApiVersion";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange";
import type { z } from "zod/v4";
import type { SharedContext } from "../../../types/sharedContext";
import type { ApiSubscription } from "../../customers/cusPlans/apiSubscription";
import { apiPurchaseV0ToSubscriptionV0 } from "../../customers/cusPlans/mappers/apiPurchaseV0ToSubscriptionV0";
import { apiSubscriptionV1ToV0 } from "../../customers/cusPlans/mappers/apiSubscriptionV1ToV0";
import { ApiEntityV1Schema } from "../apiEntity";
import { ApiEntityV2Schema } from "../apiEntityV2";

/**
 * V2.0_EntityChange: Transforms entity response TO V1 format from V2 format
 *
 * Applied when: targetVersion <= V2.0 (request is for V2.0 or older)
 *
 * Breaking changes introduced in V2.1:
 *
 * 1. Subscription schema changes:
 *    - V2.1+: Single "subscriptions" array with ApiSubscriptionV1 (auto_enable, ApiPlanV1)
 *    - V2.0: Split arrays "subscriptions" + "scheduled_subscriptions" with ApiSubscription (default, ApiPlanV0)
 *
 * Input: ApiEntityV2 (V2.1+ format)
 * Output: ApiEntityV1 (V2.0 format)
 */
export const V2_0_EntityChange = defineVersionChange({
	name: "V2_0 Entity Change",
	newVersion: ApiVersion.V2_1,
	oldVersion: ApiVersion.V2_0,
	description: [
		"Subscription schema transforms (V1 to V0) - plan field versioning",
	],
	affectedResources: [AffectedResource.Entity],
	newSchema: ApiEntityV2Schema,
	oldSchema: ApiEntityV1Schema,
	affectsResponse: true,

	transformResponse: ({
		ctx,
		input,
	}: {
		ctx: SharedContext;
		input: z.infer<typeof ApiEntityV2Schema>;
	}): z.infer<typeof ApiEntityV1Schema> => {
		// Transform subscriptions from V1 to V0
		const allSubscriptions = input.subscriptions ?? [];

		const activeSubscriptionsV0: ApiSubscription[] = allSubscriptions
			.filter((sub) => sub.status === "active")
			.map((sub) => apiSubscriptionV1ToV0({ ctx, input: sub }));

		const scheduledSubscriptionsV0: ApiSubscription[] = allSubscriptions
			.filter((sub) => sub.status === "scheduled")
			.map((sub) => apiSubscriptionV1ToV0({ ctx, input: sub }));

		// Convert purchases to subscriptions and add to active subscriptions
		const purchasesAsSubscriptions: ApiSubscription[] = (
			input.purchases ?? []
		).map((purchase) =>
			apiPurchaseV0ToSubscriptionV0({ ctx, input: purchase }),
		);

		const balancesV0: Record<string, ApiBalance> = {};
		if (input.balances) {
			for (const [featureId, balance] of Object.entries(input.balances)) {
				balancesV0[featureId] = balanceV1ToV0({ input: balance });
			}
		}

		// Return V0 entity format (without purchases field)
		const { purchases: _purchases, ...rest } = input;

		return {
			...rest,
			subscriptions: [...activeSubscriptionsV0, ...purchasesAsSubscriptions],
			scheduled_subscriptions: scheduledSubscriptionsV0,
			balances: balancesV0,
		};
	},
});
