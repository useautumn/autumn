import { CustomerDataSchema } from "@api/common/customerData";
import { CustomerIdSchema } from "@api/common/customerId";
import { z } from "zod/v4";

export const UpdateCustomerParamsV0Schema = z
	.object({
		id: CustomerIdSchema.optional().describe(
			"New unique identifier for the customer",
		),
		...CustomerDataSchema.shape,
	})
	.omit({
		auto_enable_plan_id: true,
		create_in_stripe: true,
	});

export const UpdateCustomerParamsV1Schema = z
	.object({
		customer_id: CustomerIdSchema.describe("ID of the customer to update"),
		...UpdateCustomerParamsV0Schema.shape,
		new_customer_id: CustomerIdSchema.optional().describe(
			"New ID for the customer",
		),
	})
	.omit({
		id: true,
	});

export type UpdateCustomerParamsV0 = z.infer<
	typeof UpdateCustomerParamsV0Schema
>;

export type UpdateCustomerParamsV1 = z.infer<
	typeof UpdateCustomerParamsV1Schema
>;
