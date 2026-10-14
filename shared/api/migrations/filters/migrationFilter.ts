import { z } from "zod/v4";
import { CustomerFilterSchema } from "./customerFilter.js";
import { PlanFilterSchema } from "./planFilter.js";

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
