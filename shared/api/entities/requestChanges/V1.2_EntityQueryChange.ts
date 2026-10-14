import { ApiVersion } from "@api/versionUtils/ApiVersion";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange";
import type { z } from "zod/v4";
import type { SharedContext } from "../../../types/sharedContext";
import { CustomerExpand } from "../../customers/components/customerExpand/customerExpand";
import { type GetEntityQuery, GetEntityQuerySchema } from "../entityOpModels";

export const V1_2_EntityQueryChange = defineVersionChange({
	newVersion: ApiVersion.V2_0,
	oldVersion: ApiVersion.V1_Beta,
	description: [
		"Automatically expands plans.plan and features.feature for V1.2 clients",
		"Ensures V1.2 clients get full plan/feature objects",
	],
	affectedResources: [AffectedResource.Entity],
	newSchema: GetEntityQuerySchema,
	oldSchema: GetEntityQuerySchema,

	affectsRequest: true,
	affectsResponse: false,

	transformRequest: ({
		ctx: _ctx,
		input,
	}: {
		ctx: SharedContext;
		input: z.infer<typeof GetEntityQuerySchema>;
	}) => {
		const existingExpand = input.expand || [];

		const newExpand = [
			...existingExpand,
			CustomerExpand.SubscriptionsPlan,
			CustomerExpand.BalancesFeature,
			CustomerExpand.FlagsFeature,
			CustomerExpand.PurchasesPlan,
		] as GetEntityQuery["expand"];

		return {
			...input,
			expand: newExpand,
		} satisfies z.infer<typeof GetEntityQuerySchema>;
	},
});
