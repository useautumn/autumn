import { CreatePlanItemParamsV0Schema } from "@api/products/items/crud/createPlanItemV0Params.js";
import { z } from "zod/v4";
import { ApiFreeTrialV2Schema } from "../../models.js";
import { PlanPriceSchema } from "../../products/crud/planOpModels.js";

export const PlanOverrideSchema = z
	.object({
		price: PlanPriceSchema.optional(),
		features: z.array(CreatePlanItemParamsV0Schema).optional(),
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

type PlanOverride = z.infer<typeof PlanOverrideSchema>;
