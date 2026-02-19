import z from "zod/v4";

export const OpenCustomerPortalResponseSchema = z.object({
	customer_id: z.string().meta({
		description: "The ID of the billing portal session",
	}),
	url: z.string().meta({
		description: "URL to the billing portal",
	}),
});
