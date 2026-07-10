import { z } from "zod/v4";

export const LicenseInventorySchema = z.object({
	included: z.number().meta({
		description: "Total licenses the plan grants for this customer.",
	}),
	assigned: z.number().meta({
		description: "Licenses currently assigned to entities.",
	}),
	available: z.number().meta({
		description:
			"Licenses still available to assign (included minus assigned).",
	}),
});

export const ApiCustomerLicenseV0Schema = z.object({
	parent_plan_id: z.string().meta({
		description: "The plan that offers this license.",
	}),
	license_plan_id: z.string().meta({
		description: "The plan offered as an assignable license.",
	}),
	license_plan_name: z.string().meta({
		description: "Display name of the license plan.",
	}),
	inventory: LicenseInventorySchema,
	assignments: z
		.array(
			z.object({
				assignment_id: z.string(),
				entity_id: z.string(),
				license_plan_id: z.string(),
				started_at: z.number(),
			}),
		)
		.meta({ description: "Active license assignments for this customer." }),
});

export type LicenseInventory = z.infer<typeof LicenseInventorySchema>;
export type ApiCustomerLicenseV0 = z.infer<typeof ApiCustomerLicenseV0Schema>;
