import { ApiVersion } from "@api/versionUtils/ApiVersion";
import { defineVersionChange } from "@api/versionUtils/versionChangeUtils/VersionChange";
import type { z } from "zod/v4";
import { ApiTrialsUsedV1Schema } from "../apiTrialsUsedV1";
import { ApiTrialsUsedV0Schema } from "../prevVersions/apiTrialsUsedV0";

export function transformTrialsUsedToV0({
	input,
}: {
	input: z.infer<typeof ApiTrialsUsedV1Schema>;
}): z.infer<typeof ApiTrialsUsedV0Schema> {
	return {
		product_id: input.plan_id,
		customer_id: input.customer_id,
		fingerprint: input.fingerprint,
	};
}

export const V1_2_TrialsUsedChange = defineVersionChange({
	newVersion: ApiVersion.V2_0,
	oldVersion: ApiVersion.V1_Beta,
	description: [
		"Products renamed to plans in SDK",
		"TrialsUsed plan_id renamed to product_id for V1.2 compatibility",
	],
	affectedResources: [],
	newSchema: ApiTrialsUsedV1Schema,
	oldSchema: ApiTrialsUsedV0Schema,

	transformResponse: transformTrialsUsedToV0,
});
