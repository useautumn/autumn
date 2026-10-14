import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import type { z } from "zod/v4";
import type { SharedContext } from "../../../../types/sharedContext.js";
import { CheckQuerySchema } from "../checkParams.js";
import { CheckExpand } from "../enums/CheckExpand.js";

export const V1_2_CheckQueryChange = defineVersionChange({
	newVersion: ApiVersion.V2_0,
	oldVersion: ApiVersion.V1_2,
	description: [
		"Automatically expands balance.feature for V1.2 clients",
		"Ensures V1.2 clients get full feature object in balance",
	],
	affectedResources: [AffectedResource.Check],
	newSchema: CheckQuerySchema,
	oldSchema: CheckQuerySchema,

	affectsRequest: true,
	affectsResponse: false,

	transformRequest: ({
		ctx: _ctx,
		input,
	}: {
		ctx: SharedContext;
		input: z.infer<typeof CheckQuerySchema>;
	}) => {
		const existingExpand = input.expand || [];

		const newExpand: CheckExpand[] = [
			...(existingExpand as CheckExpand[]),
			CheckExpand.BalanceFeature,
			CheckExpand.FlagFeature,
		];

		return {
			...input,
			expand: newExpand,
		} satisfies z.infer<typeof CheckQuerySchema>;
	},
});
