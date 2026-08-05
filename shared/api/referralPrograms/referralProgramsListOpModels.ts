import { z } from "zod/v4";
import { ApiReferralProgramV0Schema } from "./components/apiReferralProgramV0.js";

export const ListReferralProgramsParamsSchema = z.object({}).strict();
export const ListReferralProgramsResponseSchema = z.object({
	referral_programs: z.array(ApiReferralProgramV0Schema),
});

export type ListReferralProgramsParams = z.infer<
	typeof ListReferralProgramsParamsSchema
>;
export type ListReferralProgramsResponse = z.infer<
	typeof ListReferralProgramsResponseSchema
>;
