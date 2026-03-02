import type { ApiBalance } from "@api/customers/cusFeatures/apiBalance";
import { balanceV1ToV0 } from "@api/customers/cusFeatures/mappers/balanceV1ToV0";
import { apiPurchasesV0ToSubscriptionsV0 } from "@api/customers/cusPlans/mappers/apiPurchasesV0ToSubscriptionsV0";
import { apiSubscriptionsV1ToV0 } from "@api/customers/cusPlans/mappers/apiSubscriptionsV1ToV0";
import { ApiVersion } from "@api/versionUtils/ApiVersion";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange";
import type { z } from "zod/v4";
import type { SharedContext } from "../../../types/sharedContext";
import type { ApiSubscription } from "../../customers/cusPlans/apiSubscription";
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
 * 2. Subscription merging:
 *    - V2.1+: Each customer product is a separate entry (unmerged)
 *    - V2.0: Same plan_id + status are merged (quantities summed)
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
		// Merge subscriptions first (V2.1 returns unmerged, V2.0 expects merged)
		const mergedSubscriptions = apiSubscriptionsV1ToV0({
			ctx,
			input: input.subscriptions ?? [],
		});

		// Merge purchases as subscriptions
		const purchasesAsSubscriptions: ApiSubscription[] =
			apiPurchasesV0ToSubscriptionsV0({
				ctx,
				purchases: input.purchases ?? [],
			});

		const activeSubscriptionsV0: ApiSubscription[] = mergedSubscriptions.filter(
			(sub) => sub.status === "active",
		);

		const scheduledSubscriptionsV0: ApiSubscription[] =
			mergedSubscriptions.filter((sub) => sub.status === "scheduled");

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
