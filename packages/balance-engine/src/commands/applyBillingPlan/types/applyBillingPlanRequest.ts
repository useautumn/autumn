import { z } from "zod/v4";
import { catalogRowSchema } from "../../../models/catalog/catalogRow.js";
import { applyBillingPlanCommandSchema } from "./applyBillingPlanCommand.js";

export const applyBillingPlanRequestSchema = z
	.object({
		command: applyBillingPlanCommandSchema,
		catalogRows: z.array(catalogRowSchema),
	})
	.loose();

export type ApplyBillingPlanRequest = z.infer<
	typeof applyBillingPlanRequestSchema
>;
