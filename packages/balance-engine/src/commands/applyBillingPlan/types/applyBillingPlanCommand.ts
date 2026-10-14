import { z } from "zod/v4";
import { mutatingCommandSchema } from "../../../models/command/baseCommand.js";
import { nonEmptyStringSchema } from "../../../models/common/primitives.js";
import { billingPlanOpSchema } from "./billingPlanOp.js";

export const applyBillingPlanCommandSchema = mutatingCommandSchema
	.extend({
		type: z.literal("applyBillingPlan"),
		entityIds: z.array(nonEmptyStringSchema),
		ops: z.array(billingPlanOpSchema).min(1),
		expiringPooledBalanceIds: z.array(nonEmptyStringSchema).default([]),
	})
	.loose();

export type ApplyBillingPlanCommand = z.infer<
	typeof applyBillingPlanCommandSchema
>;
