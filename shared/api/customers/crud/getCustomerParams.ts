import { CustomerIdSchema } from "@api/common/customerId";
import { queryStringArray } from "@api/common/queryHelpers";
import { CustomerExpandEnum } from "@api/customers/components/customerExpand/customerExpand";
import { z } from "zod/v4";

export const GetCustomerParamsSchema = z.object({
	customer_id: CustomerIdSchema.describe("ID of the customer to fetch"),
	expand: queryStringArray(CustomerExpandEnum).optional().meta({
		description: "Fields to expand in the returned customer response",
	}),
	with_autumn_id: z.boolean().default(false).meta({
		internal: true,
	}),
});

export type GetCustomerParams = z.infer<typeof GetCustomerParamsSchema>;
