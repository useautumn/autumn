import { z } from "zod/v4";

export const TrackLegacyDataSchema = z.object({
	feature_id: z.string(),
});

type TrackLegacyData = z.infer<typeof TrackLegacyDataSchema>;
