import { z } from "zod/v4";

export const ApiCustomerLicenseV0Schema = z.object({
	license_plan_id: z.string().meta({
		description: "The plan offered as an assignable license.",
	}),
	parent_plan_id: z.string().meta({
		description: "The plan that offers this license.",
	}),
	license_plan_name: z.string().meta({
		description: "Display name of the license plan.",
	}),
	granted: z.number().meta({
		description:
			"Total seats the customer has for this license, included plus paid.",
	}),
	usage: z.number().meta({
		description: "Seats currently assigned to entities.",
	}),
	remaining: z.number().meta({
		description: "Seats still available to assign.",
	}),
	paid_quantity: z.number().meta({
		description: "Paid seats purchased on top of the plan's included amount.",
	}),
});

export type ApiCustomerLicenseV0 = z.infer<typeof ApiCustomerLicenseV0Schema>;
