import { ApiVersion } from "@api/versionUtils/ApiVersion";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange";
import type { z } from "zod/v4";
import type { SharedContext } from "../../../types/sharedContext";
import { CustomerExpand } from "../components/customerExpand/customerExpand";
import { GetCustomerQuerySchema } from "../customerOpModels";

export const V1_2_CustomerQueryChange = defineVersionChange({
	newVersion: ApiVersion.V2_0,
	oldVersion: ApiVersion.V1_Beta,
	description: [
		"Automatically expands plans.plan and features.feature for V1.2 clients",
		"Ensures V1.2 clients get full plan/feature objects",
	],
	affectedResources: [AffectedResource.Customer],
	newSchema: GetCustomerQuerySchema,
	oldSchema: GetCustomerQuerySchema,

	affectsRequest: true,
	affectsResponse: false,

	transformRequest: ({
		ctx: _ctx,
		input,
	}: {
		ctx: SharedContext;
		input: z.infer<typeof GetCustomerQuerySchema>;
	}) => {
		const existingExpand = input.expand || [];

		const newExpand = [
			...existingExpand,
			CustomerExpand.SubscriptionsPlan,
			CustomerExpand.PurchasesPlan,
			CustomerExpand.BalancesFeature,
			CustomerExpand.FlagsFeature,
		];

		return {
			...input,
			expand: newExpand,
		} satisfies z.infer<typeof GetCustomerQuerySchema>;
	},
});
