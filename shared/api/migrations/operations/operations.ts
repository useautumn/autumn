import { z } from "zod/v4";
import { CustomerOperationsSchema } from "./customer/customerOperations.js";

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
