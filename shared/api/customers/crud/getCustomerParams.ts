import { CustomerIdSchema } from "@api/common/customerId";
import { z } from "zod/v4";
import { GetCustomerQuerySchema } from "../customerOpModels";

export const GetCustomerParamsV1Schema = z
	.object({
		customer_id: CustomerIdSchema.describe("ID of the customer to fetch"),
	})
	.extend(GetCustomerQuerySchema.shape);

export type GetCustomerParamsV1 = z.infer<typeof GetCustomerParamsV1Schema>;
