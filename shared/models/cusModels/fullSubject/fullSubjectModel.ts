import { z } from "zod/v4";
import { FullAggregatedFeatureBalanceSchema } from "../../cusProductModels/cusEntModels/aggregatedCusEnt.js";
import { FullCustomerEntitlementSchema } from "../../cusProductModels/cusEntModels/cusEntModels.js";
import { UsageWindowSchema } from "../../cusProductModels/cusEntModels/usageWindowTable.js";
import { FullCusProductSchema } from "../../cusProductModels/cusProductModels.js";
import { MigrationItemRunSchema } from "../../migrationV2Models/migrationItemRunSchema.js";
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

	// Customer- or entity-scoped windowed-cap counters (one row per capped
	// feature + window; internal_entity_id null = customer scope). On an entity
	// subject this carries ONLY that entity's rows. Live data read from the
	// per-feature balance hashes, never from the cached subject view.
	usage_windows: z.array(UsageWindowSchema).optional(),

	subscriptions: z.array(SubscriptionSchema).optional(),
	invoices: z.array(InvoiceSchema),

	aggregated_customer_products: z.array(FullCusProductSchema).optional(),
	aggregated_customer_entitlements: z
		.array(FullAggregatedFeatureBalanceSchema)
		.optional(),
	aggregated_subject_flags: z
		.record(z.string(), AggregatedSubjectFlagSchema)
		.optional(),

	migration_item_runs: z.array(MigrationItemRunSchema).optional(),
});

export type FullSubject = z.infer<typeof FullSubjectSchema>;
