import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import type { z } from "zod/v4";
import { ApiCustomerSchema } from "../apiCustomer.js";
import { ApiCustomerV5Schema } from "../apiCustomerV5.js";
import type { ApiSubscription } from "../cusPlans/apiSubscription.js";
import { apiSubscriptionV1ToV0 } from "../cusPlans/mappers/apiSubscriptionV1ToV0.js";
import { CustomerLegacyDataSchema } from "../customerLegacyData.js";

export const V2_0_CustomerChange = defineVersionChange({
	name: "V2_0 Customer Change",
	newVersion: ApiVersion.V2_1,
	oldVersion: ApiVersion.V2_0,
	description: [
		"Subscription schema transforms (V1 to V0) - plan field versioning",
	],
	affectedResources: [AffectedResource.Customer],
	newSchema: ApiCustomerV5Schema,
	oldSchema: ApiCustomerSchema,
	legacyDataSchema: CustomerLegacyDataSchema,
	affectsResponse: true,

	transformResponse: ({
		input,
	}: {
		input: z.infer<typeof ApiCustomerV5Schema>;
		legacyData?: z.infer<typeof CustomerLegacyDataSchema>;
	}): z.infer<typeof ApiCustomerSchema> => {
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
