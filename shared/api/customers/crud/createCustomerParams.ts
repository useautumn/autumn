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
export const CreateCustomerParamsV0Schema = z
	.object({
		id: CustomerIdSchema.optional().nullable(),
		...CustomerDataSchema.shape,
	})
	.extend({
		expand: CustomerExpandArraySchema.optional(),

		entity_id: z.string().optional().meta({
			internal: true,
		}),
		entity_data: EntityDataSchema.optional().meta({
			internal: true,
		}),

		with_autumn_id: z.boolean().default(false).meta({
			internal: true,
		}),
		internal_options: CreateCustomerInternalOptionsSchema.optional().meta({
			internal: true,
		}),
	});

export const CreateCustomerParamsV1Schema = z
	.object({
		customer_id: CustomerIdSchema.nullable(),
		...CreateCustomerParamsV0Schema.shape,
	})
	.omit({
		id: true,
	});

export type CreateCustomerParamsV0 = z.infer<
	typeof CreateCustomerParamsV0Schema
>;
