import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import type { z } from "zod/v4";
import type { ApiBalance } from "../../customers/cusFeatures/apiBalance.js";
import { transformApiBalanceV1ToV0 } from "../../customers/cusFeatures/changes/transformApiBalanceV1ToV0.js";
import type { ApiSubscription } from "../../customers/cusPlans/apiSubscription.js";
import { transformApiSubscriptionV1ToV0 } from "../../customers/cusPlans/changes/V2.0_ApiSubscriptionChange.js";
import { ApiEntityV1Schema } from "../apiEntity.js";
import { ApiEntityV2Schema } from "../apiEntityV2.js";
import { EntityLegacyDataSchema } from "../entityLegacyData.js";

export const V2_0_EntityChange = defineVersionChange({
	name: "V2_0 Entity Change",
	newVersion: ApiVersion.V2_1,
	oldVersion: ApiVersion.V2_0,
	description: ["Balance and subscription schema transforms"],
	affectedResources: [AffectedResource.Entity],
	newSchema: ApiEntityV2Schema,
	oldSchema: ApiEntityV1Schema,
	legacyDataSchema: EntityLegacyDataSchema,
	affectsResponse: true,

	transformResponse: ({
		input,
		legacyData,
	}: {
		input: z.infer<typeof ApiEntityV2Schema>;
		legacyData?: z.infer<typeof EntityLegacyDataSchema>;
	}): z.infer<typeof ApiEntityV1Schema> => {
		let transformedBalances: Record<string, ApiBalance> | undefined;
		if (input.balances) {
			transformedBalances = {};
			for (const [featureId, balance] of Object.entries(input.balances)) {
				transformedBalances[featureId] = transformApiBalanceV1ToV0({
					input: balance,
					legacyData: legacyData?.cusFeatureLegacyData?.[featureId],
				});
			}
		}

		// Transform and split subscriptions by status
		// EntityV2 has all subs in one array with status field, EntityV1 splits them into two arrays
		const allSubscriptions = input.subscriptions ?? [];

		const transformedSubscriptions: ApiSubscription[] | undefined =
			allSubscriptions.length > 0
				? allSubscriptions
						.filter((sub) => sub.status !== "scheduled")
						.map((sub) => transformApiSubscriptionV1ToV0({ input: sub }))
				: undefined;

		const transformedScheduledSubscriptions: ApiSubscription[] =
			allSubscriptions
				.filter((sub) => sub.status === "scheduled")
				.map((sub) => transformApiSubscriptionV1ToV0({ input: sub }));

		return {
			...input,
			subscriptions: transformedSubscriptions,
			scheduled_subscriptions: transformedScheduledSubscriptions,
			balances: transformedBalances,
		};
	},
});
