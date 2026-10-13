import { ApiVersion } from "@api/versionUtils/ApiVersion.js";
import {
	AffectedResource,
	defineVersionChange,
} from "@api/versionUtils/versionChangeUtils/VersionChange.js";
import type { z } from "zod/v4";
import { BatchTrackParamsV2_4Schema } from "../prevVersions/batchTrackParamsV2_4.js";
import { BatchTrackParamsSchema } from "../trackParams.js";

/** 2.5 batch items have no `async`; older clients' items drop it (it never had an effect). */
export const V2_4_BatchTrackParamsChange = defineVersionChange({
	name: "V2_4 Batch Track Params Change",
	newVersion: ApiVersion.V2_5,
	oldVersion: ApiVersion.V2_4,
	description: ["Batch track items no longer accept async"],
	affectedResources: [AffectedResource.BatchTrack],
	newSchema: BatchTrackParamsSchema,
	oldSchema: BatchTrackParamsV2_4Schema,

	affectsRequest: true,
	affectsResponse: false,

	transformRequest: ({
		input,
	}: {
		input: z.infer<typeof BatchTrackParamsV2_4Schema>;
	}): z.infer<typeof BatchTrackParamsSchema> =>
		input.map(({ async: _async, ...item }) => item),
});
