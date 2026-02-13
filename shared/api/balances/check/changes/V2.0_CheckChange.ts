import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import type { z } from "zod/v4";
import { balanceV1ToV0 } from "../../../customers/cusFeatures/mappers/balanceV1ToV0.js";
import { CheckResponseV2Schema } from "../checkResponseV2.js";
import { CheckResponseV3Schema } from "../checkResponseV3.js";

/**
 * V2_0_CheckChange: Transforms check response from V3 (V2.1) to V2 (V2.0) format
 *
 * Applied when: targetVersion <= V2.0
 *
 * Changes:
 * - Transforms balance from ApiBalanceV1 to ApiBalance (V0 format)
 */
export const V2_0_CheckChange = defineVersionChange({
	name: "V2_0 Check Change",
	newVersion: ApiVersion.V2_1,
	oldVersion: ApiVersion.V2_0,
	description: ["Balance schema transform (V1 to V0)"],
	affectedResources: [AffectedResource.Check],
	newSchema: CheckResponseV3Schema,
	oldSchema: CheckResponseV2Schema,
	affectsResponse: true,

	transformResponse: ({
		input,
	}: {
		input: z.infer<typeof CheckResponseV3Schema>;
	}): z.infer<typeof CheckResponseV2Schema> => {
		return {
			...input,
			balance: input.balance ? balanceV1ToV0({ input: input.balance }) : null,
		};
	},
});
