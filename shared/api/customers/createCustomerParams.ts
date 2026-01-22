import { CustomerIdSchema } from "@api/common/customerId.js";
import { z } from "zod/v4";
import {
	CreateCustomerInternalOptionsSchema,
	CustomerDataSchema,
} from "../common/customerData.js";
import { EntityDataSchema } from "../common/entityData.js";

// Create Customer Params (based on handlePostCustomer logic)
export const ExtCreateCustomerParamsSchema = z
	.object({
		id: CustomerIdSchema.nullable().meta({
			description: "Your unique identifier for the customer",
		}),
	})
	.extend(CustomerDataSchema.shape)
	.extend({
		entity_id: z.string().optional().meta({
			internal: true,
		}),
		entity_data: EntityDataSchema.optional().meta({
			internal: true,
		}),
	});

export const CreateCustomerParamsSchema = ExtCreateCustomerParamsSchema.extend({
	internal_options: CreateCustomerInternalOptionsSchema.optional(),
});

export type ExtCreateCustomerParams = z.infer<
	typeof ExtCreateCustomerParamsSchema
>;

export type CreateCustomerParams = z.infer<typeof CreateCustomerParamsSchema>;
