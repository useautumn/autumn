import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import type { z } from "zod/v4";
import { TrackTokensParamsSchema } from "../trackTokensParams.js";

/** V2.5 tracks tokens async unless `async: false`; older clients keep sync unless `async: true`. */
export const V2_4_TrackTokensParamsChange = defineVersionChange({
	name: "V2_4 Track Tokens Params Change",
	newVersion: ApiVersion.V2_5,
	oldVersion: ApiVersion.V2_4,
	description: ["Track tokens defaults to async: an omitted async means false"],
	affectedResources: [AffectedResource.TrackTokens],
	newSchema: TrackTokensParamsSchema,
	oldSchema: TrackTokensParamsSchema,

	affectsRequest: true,
	affectsResponse: false,

	transformRequest: ({
		input,
	}: {
		input: z.infer<typeof TrackTokensParamsSchema>;
	}): z.infer<typeof TrackTokensParamsSchema> => ({
		...input,
		async: input.async ?? false,
	}),
});
