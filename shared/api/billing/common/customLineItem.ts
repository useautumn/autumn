import { z } from "zod/v4";

export const CustomLineItemSchema = z.object({
	amount: z.number().meta({
		description:
			"Amount in dollars for this line item (e.g. 10.50). Can be negative for credits.",
	}),
	description: z.string().meta({
		description: "Description for the line item.",
	}),
});

export type CustomLineItem = z.infer<typeof CustomLineItemSchema>;
