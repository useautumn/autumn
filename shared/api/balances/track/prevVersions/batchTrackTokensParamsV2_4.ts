import { z } from "zod/v4";
import { TrackTokensParamsSchema } from "../trackTokensParams.js";

/** ≤ 2.4 batch items accepted `async`, which batch always ignored. */
export const BatchTrackTokensParamsV2_4Schema = z
	.array(TrackTokensParamsSchema)
	.min(1)
	.max(1000);

export type BatchTrackTokensParamsV2_4 = z.infer<
	typeof BatchTrackTokensParamsV2_4Schema
>;
