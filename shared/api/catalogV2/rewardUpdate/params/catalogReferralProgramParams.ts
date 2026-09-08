import { CreateReferralProgramParamsSchema } from "@api/referralPrograms/referralProgramsCreateOpModels.js";
import type { z } from "zod/v4";

export const UpdateCatalogReferralProgramParamsSchema =
	CreateReferralProgramParamsSchema;

export type UpdateCatalogReferralProgramParams = z.infer<
	typeof UpdateCatalogReferralProgramParamsSchema
>;
