import { ApiVersion } from "@api/versionUtils/ApiVersion";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange";
import { z } from "zod/v4";

const NoOpSchema = z.any();

/** Side-effect only: <= V2.3 customer reads fold in entity-level data. */
export const V2_3_CustomerEntityData = defineVersionChange({
	name: "V2_3_CustomerEntityData",
	newVersion: ApiVersion.V2_4,
	oldVersion: ApiVersion.V2_3,
	description: [
		"Customer object aggregated entity-level subscriptions and balances before V2_4",
	],
	affectedResources: [AffectedResource.Customer],
	newSchema: NoOpSchema,
	oldSchema: NoOpSchema,
	hasSideEffects: true,
	transformResponse: ({ input }) => input,
});
