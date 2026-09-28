import { z } from "zod/v4";
import { mutatingCommandSchema } from "../../../models/command/baseCommand.js";
import { nonEmptyStringSchema } from "../../../models/common/primitives.js";
import { billingPlanOpSchema } from "./billingPlanOp.js";

/** A billing plan's changes to a customer and the entities it names, applied as one mutation. Inserting the customer requires it absent. */
export const applyBillingPlanCommandSchema = mutatingCommandSchema
	.extend({
		type: z.literal("applyBillingPlan"),
		/** Every entity whose rows the ops touch, by external id; the identity names only the customer. */
		entityIds: z.array(nonEmptyStringSchema),
		ops: z.array(billingPlanOpSchema).min(1),
		/** Pools whose last share this plan removes, as the worker read Postgres before deciding; the server sends none. */
		expiringPooledBalanceIds: z.array(nonEmptyStringSchema).default([]),
	})
	.strict();

export type ApplyBillingPlanCommand = z.infer<
	typeof applyBillingPlanCommandSchema
>;
