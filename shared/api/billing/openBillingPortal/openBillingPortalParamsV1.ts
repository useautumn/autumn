import z from "zod/v4";
export const OpenCustomerPortalParamsV1Schema = z.object({
	customer_id: z.string().meta({
		description: "The ID of the customer to open the billing portal for.",
	}),
	configuration_id: z.string().optional().meta({
		description:
			"Stripe billing portal configuration ID. Create configurations in your Stripe dashboard.",
	}),
	return_url: z.string().optional().meta({
		description:
			"URL to redirect to when back button is clicked in the billing portal",
	}),
});
