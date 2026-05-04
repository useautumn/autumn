import { z } from "zod/v4";
import { FullAggregatedFeatureBalanceSchema } from "../../cusProductModels/cusEntModels/aggregatedCusEnt.js";
import { FullCustomerEntitlementSchema } from "../../cusProductModels/cusEntModels/cusEntModels.js";
import { FullCusProductSchema } from "../../cusProductModels/cusProductModels.js";
import { SubscriptionSchema } from "../../subModels/subModels.js";
import { CustomerSchema } from "../cusModels.js";
import { EntitySchema } from "../entityModels/entityModels.js";
import { InvoiceSchema } from "../invoiceModels/invoiceModels.js";
import { AggregatedSubjectFlagSchema } from "./normalizedFullSubjectModel.js";

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
		.array(FullAggregatedFeatureBalanceSchema)
		.optional(),
	aggregated_subject_flags: z
		.record(z.string(), AggregatedSubjectFlagSchema)
		.optional(),
});

export type FullSubject = z.infer<typeof FullSubjectSchema>;
