import { z } from "zod/v4";

export const CreatePlanInStripeParamsSchema = z.object({
	plan_id: z.string().nonempty().meta({
		description: "The plan to create a Stripe product and prices for.",
	}),
});

export type CreatePlanInStripeParams = z.infer<
	typeof CreatePlanInStripeParamsSchema
>;
