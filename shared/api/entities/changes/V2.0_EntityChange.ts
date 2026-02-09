import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import type { z } from "zod/v4";
import type { ApiSubscription } from "../../customers/cusPlans/apiSubscription.js";
import { apiSubscriptionV1ToV0 } from "../../customers/cusPlans/mappers/apiSubscriptionV1ToV0.js";
import { ApiEntityV1Schema } from "../apiEntity.js";
import { ApiEntityV2Schema } from "../apiEntityV2.js";
import { EntityLegacyDataSchema } from "../entityLegacyData.js";

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
	legacyDataSchema: EntityLegacyDataSchema,
	affectsResponse: true,

	transformResponse: ({
		input,
	}: {
		input: z.infer<typeof ApiEntityV2Schema>;
		legacyData?: z.infer<typeof EntityLegacyDataSchema>;
	}): z.infer<typeof ApiEntityV1Schema> => {
		// Transform subscriptions from V1 to V0
		const allSubscriptions = input.subscriptions ?? [];

		const activeSubscriptionsV0: ApiSubscription[] = allSubscriptions
			.filter((sub) => sub.status === "active")
			.map((sub) => apiSubscriptionV1ToV0({ input: sub }));

		const scheduledSubscriptionsV0: ApiSubscription[] = allSubscriptions
			.filter((sub) => sub.status === "scheduled")
			.map((sub) => apiSubscriptionV1ToV0({ input: sub }));

		return {
			...input,
			subscriptions: activeSubscriptionsV0,
			scheduled_subscriptions: scheduledSubscriptionsV0,
		};
	},
});
