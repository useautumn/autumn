import { CustomerIdSchema } from "@api/common/customerId.js";
import { z } from "zod/v4";

export const DeleteCustomerParamsSchema = z.object({
	customer_id: CustomerIdSchema.describe("ID of the customer to delete"),
	delete_in_stripe: z
		.boolean()
		.optional()
		.default(false)
		.describe("Whether to also delete the customer in Stripe"),
});

export const DeleteCustomerResponseSchema = z.object({
	success: z.boolean(),
});

export type DeleteCustomerParams = z.infer<typeof DeleteCustomerParamsSchema>;
export type DeleteCustomerResponse = z.infer<
	typeof DeleteCustomerResponseSchema
>;
