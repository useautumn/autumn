import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import {
	type FinalizeLockParamsV0,
	FinalizeLockParamsV0Schema,
} from "../finalizeLockParamsV0.js";
import {
	type FinalizeLockParamsV1,
	FinalizeLockParamsV1Schema,
} from "../finalizeLockParamsV1.js";

/** A finalize names its lock's customer from V2.6; an older one names none, which the handler reads as the lock_id-only search. */
export const V2_5_FinalizeLockParamsChange = defineVersionChange({
	name: "V2_5 Finalize Lock Params Change",
	newVersion: ApiVersion.V2_6,
	oldVersion: ApiVersion.V2_5,
	description: ["Finalize takes the lock's customer_id"],
	affectedResources: [AffectedResource.FinalizeLock],
	newSchema: FinalizeLockParamsV1Schema,
	oldSchema: FinalizeLockParamsV0Schema,

	affectsRequest: true,
	affectsResponse: false,

	transformRequest: ({
		input,
	}: {
		input: FinalizeLockParamsV0;
	}): FinalizeLockParamsV1 => ({ ...input, customer_id: "" }),
});
