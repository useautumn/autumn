import { z } from "zod/v4";
import { CustomerFilterSchema } from "./customerFilter.js";
import { PlanFilterSchema } from "./planFilter.js";

/**
 * Top-level migration filter, scoped by resource. Mirrors the
 * operations shape (`{ customer, plan }`).
 *
 * - `customer` selects customers via `CustomerFilter`.
 * - `plan` selects catalog plans via `PlanFilter` (phase 2+ resource).
 *
 * At least one resource block is required at runtime.
 */
export const MigrationFilterSchema = z
	.object({
		customer: CustomerFilterSchema.optional(),
		plan: PlanFilterSchema.optional(),
	})
	.check((ctx) => {
		if (ctx.value.customer === undefined && ctx.value.plan === undefined) {
			ctx.issues.push({
				code: "custom",
				message: "filter requires at least one resource block",
				input: ctx.value,
			});
		}
	});

export type MigrationFilter = z.infer<typeof MigrationFilterSchema>;
