import { DiffedCustomizePlanV1Schema } from "@utils/planV1Utils/diff/diffPlanV1.js";
import { z } from "zod/v4";
import { ApiPlanV1Schema } from "../../apiPlanV1.js";
import { ApiFreeTrialV2Schema } from "../apiFreeTrialV2.js";
import { PlanItemChangeV0Schema } from "./planItemChangeV0.js";
import { PlanPreviousAttributesV0Schema } from "./planPreviousAttributesV0.js";

/** Before/after for the plan's price. Absent when the price is unchanged. */
export const PlanPriceChangeV0Schema = z.object({
	// Null when the plan is new: a create has no previous price.
	previous: ApiPlanV1Schema.shape.price.nullable().meta({
		description: "The plan's price before the change.",
	}),
	current: ApiPlanV1Schema.shape.price.meta({
		description: "The plan's price after the change.",
	}),
});

/** Before/after for the plan's free trial. Absent when the trial is unchanged. */
export const PlanFreeTrialChangeV0Schema = z.object({
	previous: ApiFreeTrialV2Schema.nullable().meta({
		description: "The plan's free trial before the change. Null when none.",
	}),
	current: ApiFreeTrialV2Schema.nullable().meta({
		description: "The plan's free trial after the change. Null when none.",
	}),
});

/**
 * Core plan diff (price, items, trial, scalars). Nested under a license change
 * as `plan_change` — the effective child is ApiPlanV1, so no license_changes.
 */
export const PlanChangeCoreV0Schema = z.object({
	plan: ApiPlanV1Schema.optional().meta({
		description:
			"The plan after the change. Omitted unless the caller expands it.",
	}),
	previous_attributes: PlanPreviousAttributesV0Schema.nullable().meta({
		description:
			"Sparse map of scalar plan fields that changed, holding their previous values. Null when the plan is new.",
	}),
	price_change: PlanPriceChangeV0Schema.optional().meta({
		description: "Present when the plan's price changed.",
	}),
	free_trial_change: PlanFreeTrialChangeV0Schema.optional().meta({
		description: "Present when the plan's free trial changed.",
	}),
	item_changes: z.array(PlanItemChangeV0Schema).default([]).meta({
		description: "Feature items added to or removed from the plan.",
	}),
	customize: DiffedCustomizePlanV1Schema.optional().meta({
		description:
			"Params that would transform the previous plan into the current one. Omitted when nothing customizable changed.",
	}),
});

export type PlanPriceChangeV0 = z.infer<typeof PlanPriceChangeV0Schema>;
export type PlanFreeTrialChangeV0 = z.infer<typeof PlanFreeTrialChangeV0Schema>;
export type PlanChangeCoreV0 = z.infer<typeof PlanChangeCoreV0Schema>;
