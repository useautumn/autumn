import { FullCustomerPriceSchema } from "@models/cusProductModels/cusPriceModels/cusPriceModels";
import { FullCusProductSchema } from "@models/cusProductModels/cusProductModels";
import type { z } from "zod/v4";

export const CustomerPriceWithCustomerProductSchema =
	FullCustomerPriceSchema.extend({
		customer_product: FullCusProductSchema,
	});

export type CustomerPriceWithCustomerProduct = z.infer<
	typeof CustomerPriceWithCustomerProductSchema
>;
