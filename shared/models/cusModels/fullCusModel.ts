import { ProductSchema } from "@models/productModels/productModels.js";
import { z } from "zod/v4";
import type { FullCustomerEntitlement } from "../cusProductModels/cusEntModels/cusEntModels.js";
import {
	CusProductSchema,
	type FullCusProduct,
	FullCusProductSchema,
} from "../cusProductModels/cusProductModels.js";
import type { Event } from "../eventModels/eventTable.js";
import {
	type Subscription,
	SubscriptionSchema,
} from "../subModels/subModels.js";
import { type Customer, CustomerSchema } from "./cusModels.js";
import { type Entity, EntitySchema } from "./entityModels/entityModels.js";
import { type Invoice, InvoiceSchema } from "./invoiceModels/invoiceModels.js";

export const FullCustomerSchema = CustomerSchema.extend({
	customer_products: z.array(FullCusProductSchema),
	entities: z.array(EntitySchema),
	subscriptions: z.array(SubscriptionSchema).optional(),
	entity: EntitySchema.optional(),

	trials_used: z
		.array(
			z.object({
				product_id: z.string(),
				customer_id: z.string(),
				fingerprint: z.string(),
			}),
		)
		.optional(),
	invoices: z.array(InvoiceSchema).optional(),
});

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
	extra_customer_entitlements: FullCustomerEntitlement[];
};

export const CustomerWithProductsSchema = CustomerSchema.extend({
	customer_products: z.array(
		CusProductSchema.extend({ product: ProductSchema }),
	),
});

export type CustomerWithProducts = z.infer<typeof CustomerWithProductsSchema>;
