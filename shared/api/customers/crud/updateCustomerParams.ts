import { CustomerDataSchema } from "@api/common/customerData.js";
import { CustomerIdSchema } from "@api/common/customerId.js";
import { CustomerExpandArraySchema } from "@api/customers/components/customerExpand/customerExpand.js";
import { z } from "zod/v4";

export const UpdateCustomerParamsV0Schema = z
	.object({
		id: CustomerIdSchema.optional().describe(
			"New unique identifier for the customer",
		),
		expand: CustomerExpandArraySchema.optional(),
		...CustomerDataSchema.shape,
	})
	.meta({
		title: "UpdateCustomerParams",
		description: "Parameters for updating a customer",
	});

export const UpdateCustomerParamsV1Schema = z.object({
	customer_id: CustomerIdSchema.describe("ID of the customer to update"),
	...UpdateCustomerParamsV0Schema.shape,
});

export type UpdateCustomerParamsV0 = z.infer<
	typeof UpdateCustomerParamsV0Schema
>;
