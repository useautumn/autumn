import { z } from "zod/v4";

export const LicenseQuantityParamsSchema = z.object({
	license_plan_id: z.string().meta({
		description: "The license plan to set seat quantity for.",
	}),
	quantity: z.number().int().min(0).meta({
		description:
			"Total seats for the license, inclusive of the plan's included amount — seats beyond it are paid.",
	}),
});

export type LicenseQuantityParams = z.infer<typeof LicenseQuantityParamsSchema>;
