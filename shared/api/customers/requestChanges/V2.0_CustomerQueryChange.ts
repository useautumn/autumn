import { ApiVersion } from "@api/versionUtils/ApiVersion";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange";
import type { z } from "zod/v4";
import type { SharedContext } from "../../../types/sharedContext";
import { CustomerExpand } from "../components/customerExpand/customerExpand";
import { GetCustomerQuerySchema } from "../customerOpModels";

export const V2_0_CustomerQueryChange = defineVersionChange({
	newVersion: ApiVersion.V2_1,
	oldVersion: ApiVersion.V2_0,
	description: [
		"Automatically expands flags.feature when balances.feature is requested by V2.0 clients",
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

		if (!existingExpand.includes(CustomerExpand.BalancesFeature)) {
			return input;
		}

		if (existingExpand.includes(CustomerExpand.FlagsFeature)) {
			return input;
		}

		return {
			...input,
			expand: [...existingExpand, CustomerExpand.FlagsFeature],
		} satisfies z.infer<typeof GetCustomerQuerySchema>;
	},
});
