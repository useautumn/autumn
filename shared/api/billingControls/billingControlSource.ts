import { z } from "zod/v4";

export const BillingControlSourceSchema = z.enum(["customer", "plan"]).meta({
	description:
		"Response-only: whether the entry is a customer-level override or inherited from an attached plan's defaults.",
});

export type BillingControlSource = z.infer<typeof BillingControlSourceSchema>;
