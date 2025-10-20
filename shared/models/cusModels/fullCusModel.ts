import { ProductSchema } from "@models/productModels/productModels.js";
import { z } from "zod/v4";
import {
	CusProductSchema,
	type FullCusProduct,
} from "../cusProductModels/cusProductModels.js";
import type { Event } from "../eventModels/eventTable.js";
import type { Subscription } from "../subModels/subModels.js";
import { type Customer, CustomerSchema } from "./cusModels.js";
import type { Entity } from "./entityModels/entityModels.js";
import type { Invoice } from "./invoiceModels/invoiceModels.js";

export type FullCustomer = Customer & {
	customer_products: FullCusProduct[];
	entities: Entity[];
	entity?: Entity;
	trials_used?: {
		product_id: string;
		customer_id: string;
		fingerprint: string;
	}[];
	invoices?: Invoice[];
	subscriptions?: Subscription[];
	events?: Event[];
};

export const CustomerWithProductsSchema = CustomerSchema.extend({
	customer_products: z.array(
		CusProductSchema.extend({ product: ProductSchema }),
	),
});

export type CustomerWithProducts = z.infer<typeof CustomerWithProductsSchema>;
