import { type ApiPlanV1, ApiPlanV1Schema } from "@api/products/apiPlanV1";
import { planV1ToV0 } from "@api/products/mappers/planV1ToV0";
import { ApiVersion } from "@api/versionUtils/ApiVersion";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange";
import type { SharedContext } from "../../../types/sharedContext";
import { PlanLegacyDataSchema } from "../planLegacyData";
import {
	type ApiPlan,
	ApiPlanV0Schema,
} from "../previousVersions/apiPlanV0";

export const V2_0_PlanChanges = defineVersionChange({
	newVersion: ApiVersion.V2_1,
	oldVersion: ApiVersion.V2_0,
	description: [
		"Plan format changed from V2.0 to V2.1 schema",
		"Renamed default to auto_enable",
		"Renamed granted_balance to included",
		"Removed reset_when_enabled",
	],
	affectedResources: [AffectedResource.Product],
	newSchema: ApiPlanV1Schema,
	oldSchema: ApiPlanV0Schema,
	legacyDataSchema: PlanLegacyDataSchema,

	affectsRequest: false,
	affectsResponse: true,

	transformResponse: ({
		ctx,
		input,
	}: {
		ctx: SharedContext;
		input: ApiPlanV1;
	}): ApiPlan => {
		return planV1ToV0({ ctx, plan: input });
	},
});
