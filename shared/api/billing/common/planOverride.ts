import { z } from "zod/v4";
import { ApiFreeTrialV2Schema } from "../../models.js";
import { UpdatePlanFeatureSchema } from "../../products/planFeature/planFeatureOpModels.js";
import { PlanPriceSchema } from "../../products/planOpModels.js";

export const PlanOverrideSchema = z
	.object({
		price: PlanPriceSchema.optional(),
		features: z.array(UpdatePlanFeatureSchema).optional(),
		free_trial: ApiFreeTrialV2Schema.nullable().optional(),
	})
	.refine(
		(data) => {
			if (!data.price && !data.features && !data.free_trial) {
				return false;
			}

			return true;
		},
		{
			message:
				"Plan override must contain at least one of price, features, or free_trial",
		},
	);

export type PlanOverride = z.infer<typeof PlanOverrideSchema>;
