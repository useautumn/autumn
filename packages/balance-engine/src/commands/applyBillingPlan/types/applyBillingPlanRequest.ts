import { z } from "zod/v4";
import { catalogRowSchema } from "../../../models/catalog/catalogRow.js";
import { applyBillingPlanCommandSchema } from "./applyBillingPlanCommand.js";

/** What the server hands the worker: the command, and the catalog rows its rows reference. */
export const applyBillingPlanRequestSchema = z
	.object({
		command: applyBillingPlanCommandSchema,
		// The worker caches these; the log never carries them.
		catalogRows: z.array(catalogRowSchema),
	})
	.strict();

export type ApplyBillingPlanRequest = z.infer<
	typeof applyBillingPlanRequestSchema
>;
