import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import type { z } from "zod/v4";
import { TrackParamsSchema } from "../trackParams.js";

/** V2.5 tracks async unless `async: false`; older clients keep sync unless `async: true`. */
export const V2_4_TrackParamsChange = defineVersionChange({
	name: "V2_4 Track Params Change",
	newVersion: ApiVersion.V2_5,
	oldVersion: ApiVersion.V2_4,
	description: ["Track defaults to async: an omitted async means false"],
	affectedResources: [AffectedResource.Track],
	newSchema: TrackParamsSchema,
	oldSchema: TrackParamsSchema,

	affectsRequest: true,
	affectsResponse: false,

	transformRequest: ({
		input,
	}: {
		input: z.infer<typeof TrackParamsSchema>;
	}): z.infer<typeof TrackParamsSchema> => ({
		...input,
		async: input.async ?? false,
	}),
});
