import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import type { z } from "zod/v4";
import { BatchTrackTokensParamsV2_4Schema } from "../prevVersions/batchTrackTokensParamsV2_4.js";
import { BatchTrackTokensParamsSchema } from "../trackTokensParams.js";

/** 2.5 batch track_tokens items have no `async`; older clients' items drop it (it never had an effect). */
export const V2_4_BatchTrackTokensParamsChange = defineVersionChange({
	name: "V2_4 Batch Track Tokens Params Change",
	newVersion: ApiVersion.V2_5,
	oldVersion: ApiVersion.V2_4,
	description: ["Batch track_tokens items no longer accept async"],
	affectedResources: [AffectedResource.BatchTrackTokens],
	newSchema: BatchTrackTokensParamsSchema,
	oldSchema: BatchTrackTokensParamsV2_4Schema,

	affectsRequest: true,
	affectsResponse: false,

	transformRequest: ({
		input,
	}: {
		input: z.infer<typeof BatchTrackTokensParamsV2_4Schema>;
	}): z.infer<typeof BatchTrackTokensParamsSchema> =>
		input.map(({ async: _async, ...item }) => item),
});
