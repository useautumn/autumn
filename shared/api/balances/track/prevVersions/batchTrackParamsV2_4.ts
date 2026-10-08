import { z } from "zod/v4";
import { BatchTrackItemSchema } from "../trackParams.js";

/** ≤ 2.4 batch items accepted `async`, which batch always ignored. */
export const BatchTrackParamsV2_4Schema = z
	.array(BatchTrackItemSchema.and(z.object({ async: z.boolean().optional() })))
	.min(1)
	.max(1000);

export type BatchTrackParamsV2_4 = z.infer<typeof BatchTrackParamsV2_4Schema>;
