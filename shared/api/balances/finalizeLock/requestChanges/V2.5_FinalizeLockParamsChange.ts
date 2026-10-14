import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import type { z } from "zod/v4";
import { FinalizeLockParamsV0Schema } from "../finalizeLockParamsV0.js";

type FinalizeLockParams = z.infer<typeof FinalizeLockParamsV0Schema>;

/** A finalize names its lock's customer from V2.6; older clients name only the lock. */
export const V2_5_FinalizeLockParamsChange = defineVersionChange({
	name: "V2_5 Finalize Lock Params Change",
	newVersion: ApiVersion.V2_6,
	oldVersion: ApiVersion.V2_5,
	description: ["Finalize takes the lock's customer_id"],
	affectedResources: [AffectedResource.FinalizeLock],
	newSchema: FinalizeLockParamsV0Schema,
	oldSchema: FinalizeLockParamsV0Schema,

	affectsRequest: true,
	affectsResponse: false,

	transformRequest: ({
		input: { customer_id: _, ...input },
	}: {
		input: FinalizeLockParams;
	}): FinalizeLockParams => input,
});
