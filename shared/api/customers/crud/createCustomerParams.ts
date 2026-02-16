import {
	CreateCustomerInternalOptionsSchema,
	CustomerDataSchema,
} from "@api/common/customerData.js";
import { CustomerIdSchema } from "@api/common/customerId.js";
import { EntityDataSchema } from "@api/common/entityData.js";
import { queryStringArray } from "@api/common/queryHelpers";
import {
	CustomerExpandArraySchema,
	CustomerExpandEnum,
} from "@api/customers/components/customerExpand/customerExpand";
import { z } from "zod/v4";

export const CreateCustomerQuerySchema = z.object({
	expand: queryStringArray(CustomerExpandEnum).optional(),
	with_autumn_id: z.boolean().default(false).meta({
		internal: true,
	}),
});

// Create Customer Params (based on handlePostCustomer logic)
export const ExtCreateCustomerParamsSchema = z
	.object({
		customer_id: CustomerIdSchema.nullable(),
	})
	.extend(CustomerDataSchema.shape)
	.extend({
		expand: CustomerExpandArraySchema.optional(),

		entity_id: z.string().optional().meta({
			internal: true,
		}),
		entity_data: EntityDataSchema.optional().meta({
			internal: true,
		}),

		// Legacy
		id: CustomerIdSchema.optional().nullable().meta({
			internal: true,
		}),

		with_autumn_id: z.boolean().default(false).meta({
			internal: true,
		}),
		internal_options: CreateCustomerInternalOptionsSchema.optional().meta({
			internal: true,
		}),
	});

export const CreateCustomerParamsSchema = ExtCreateCustomerParamsSchema;

export type ExtCreateCustomerParams = z.infer<
	typeof ExtCreateCustomerParamsSchema
>;

export type CreateCustomerParams = z.infer<typeof CreateCustomerParamsSchema>;
