import type { z } from "zod/v4";
import { CusProductSchema, FullCusProductSchema } from "../cusProductModels.js";
import { FullCustomerEntitlementSchema } from "./cusEntModels.js";

export const FullCusEntWithProductSchema = FullCustomerEntitlementSchema.extend(
	{
		customer_product: CusProductSchema,
	},
);

export const FullCusEntWithFullCusProductSchema =
	FullCustomerEntitlementSchema.extend({
		customer_product: FullCusProductSchema.nullable(),
	});

export const FullCusEntWithOptionalProductSchema =
	FullCustomerEntitlementSchema.extend({
		customer_product: FullCusProductSchema.nullable(),
	});

export type FullCusEntWithProduct = z.infer<typeof FullCusEntWithProductSchema>;
export type FullCusEntWithFullCusProduct = z.infer<
	typeof FullCusEntWithFullCusProductSchema
>;
export type FullCusEntWithOptionalProduct = z.infer<
	typeof FullCusEntWithOptionalProductSchema
>;
