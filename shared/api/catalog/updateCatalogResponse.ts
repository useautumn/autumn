import { ApiFeatureV1Schema } from "@api/features/apiFeatureV1.js";
import { ApiPlanV1Schema } from "@api/products/apiPlanV1.js";
import { ApiReferralProgramV0Schema } from "@api/referralPrograms/components/apiReferralProgramV0.js";
import { CreateRewardResponseSchema } from "@api/rewards/rewardsCreateOpModels.js";
import { z } from "zod/v4";

export const CatalogUpdateResponseSchema = z.object({
	plans: z.array(ApiPlanV1Schema),
	features: z.array(ApiFeatureV1Schema),
	rewards: z.array(CreateRewardResponseSchema),
	referral_programs: z.array(ApiReferralProgramV0Schema),
});

export type CatalogUpdateResponse = z.infer<typeof CatalogUpdateResponseSchema>;
