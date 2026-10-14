import type { ApiBalance } from "@api/customers/cusFeatures/apiBalance";
import { balanceV1ToV0 } from "@api/customers/cusFeatures/mappers/balanceV1ToV0";
import { apiPurchasesV0ToSubscriptionsV0 } from "@api/customers/cusPlans/mappers/apiPurchasesV0ToSubscriptionsV0";
import { apiSubscriptionsV1ToV0 } from "@api/customers/cusPlans/mappers/apiSubscriptionsV1ToV0";
import { flagV0ToBalanceV0 } from "@api/customers/flags/mappers/flagV0ToBalanceV0";
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
		const mergedSubscriptions = apiSubscriptionsV1ToV0({
			ctx,
			input: input.subscriptions ?? [],
		});

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

		if (input.flags) {
			for (const [featureId, flag] of Object.entries(input.flags)) {
				balancesV0[featureId] = flagV0ToBalanceV0({ input: flag });
			}
		}

		const { purchases: _purchases, ...rest } = input;

		return {
			...rest,
			subscriptions: [...activeSubscriptionsV0, ...purchasesAsSubscriptions],
			scheduled_subscriptions: scheduledSubscriptionsV0,
			balances: balancesV0,
		};
	},
});
