import { z } from "zod/v4";
import { FullAggregatedCustomerEntitlementSchema } from "../cusProductModels/cusEntModels/aggregatedCusEnt.js";
import {
	type FullCustomerEntitlement,
	FullCustomerEntitlementSchema,
} from "../cusProductModels/cusEntModels/cusEntModels.js";
import { CustomerPriceSchema } from "../cusProductModels/cusPriceModels/cusPriceModels.js";
import {
	type FullCusProduct,
	FullCusProductSchema,
} from "../cusProductModels/cusProductModels.js";
import { SubscriptionSchema } from "../subModels/subModels.js";
import { type Customer, CustomerSchema } from "./cusModels.js";
import { type Entity, EntitySchema } from "./entityModels/entityModels.js";
import { InvoiceSchema } from "./invoiceModels/invoiceModels.js";

export const SubjectType = {
	Customer: "customer",
	Entity: "entity",
} as const;
export type SubjectType = (typeof SubjectType)[keyof typeof SubjectType];

export const FullSubjectSchema = z.object({
	subjectType: z.enum(["customer", "entity"]),

	customerId: z.string(),
	internalCustomerId: z.string(),
	entityId: z.string().optional(),
	internalEntityId: z.string().optional(),

	customer: CustomerSchema,
	entity: EntitySchema.optional(),

	customer_products: z.array(FullCusProductSchema),
	extra_customer_entitlements: z.array(FullCustomerEntitlementSchema),

	subscriptions: z.array(SubscriptionSchema).optional(),
	invoices: z.array(InvoiceSchema),

	aggregated_customer_products: z.array(FullCusProductSchema).optional(),
	aggregated_customer_entitlements: z
		.array(FullAggregatedCustomerEntitlementSchema)
		.optional(),
	aggregated_customer_prices: z.array(CustomerPriceSchema).optional(),
});

export type FullSubject = z.infer<typeof FullSubjectSchema>;

/** Backward-compat type for entity DB layer files. */
export type FullEntity = Entity & {
	customer: Customer;
	customer_products: FullCusProduct[];
	extra_customer_entitlements: FullCustomerEntitlement[];
};
