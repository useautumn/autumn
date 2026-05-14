import { z } from "zod/v4";
import { CustomerOperationsSchema } from "./customer/customerOperations.js";

/**
 * Top-level migration operations payload, scoped by resource. Mirrors
 * the filter shape (`{ customer, plan }`).
 *
 * Phase 1: only `customer` operations are implemented. `plan`
 * (catalog-level operations) is a phase 2+ slot.
 */
export const OperationsSchema = z
	.object({
		customer: CustomerOperationsSchema.optional(),
	})
	.check((ctx) => {
		if (ctx.value.customer === undefined) {
			ctx.issues.push({
				code: "custom",
				message: "operations requires at least one resource block",
				input: ctx.value,
			});
		}
	});

export type Operations = z.infer<typeof OperationsSchema>;
