import { z } from "zod/v4";
import { CusFeatureLegacyDataSchema } from "../../customers/cusFeatures/cusFeatureLegacyData.js";

export const TrackLegacyDataSchema = z.object({
	feature_id: z.string().optional(),
	// Legacy data for balance (single balance)
	balanceLegacyData: CusFeatureLegacyDataSchema.optional(),
	// Legacy data for balances (multiple balances, keyed by feature_id)
	balancesLegacyData: z.record(z.string(), CusFeatureLegacyDataSchema).optional(),
});

export type TrackLegacyData = z.infer<typeof TrackLegacyDataSchema>;
