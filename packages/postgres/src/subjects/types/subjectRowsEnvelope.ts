import {
	CusProductSchema,
	CustomerEntitlementSchema,
	EntitlementSchema,
	EntitySchema,
	FeatureSchema,
	ProductSchema,
	RolloverSchema,
} from "@autumn/shared";
import { z } from "zod/v4";

/**
 * One customer's rows as Postgres returns them, split the way the balance worker
 * keeps them: customer-owned rows and the catalog rows they reference.
 */
export const subjectRowsEnvelopeSchema = z.object({
	customer: z.object({
		internal_id: z.string(),
		id: z.string().nullable(),
		org_id: z.string(),
		env: z.string(),
	}),
	customer_products: z.array(CusProductSchema),
	customer_entitlements: z.array(CustomerEntitlementSchema),
	rollovers: z.array(RolloverSchema),
	entities: z.array(EntitySchema),
	products: z.array(ProductSchema),
	entitlements: z.array(EntitlementSchema),
	features: z.array(FeatureSchema),
});

export type SubjectRowsEnvelope = z.infer<typeof subjectRowsEnvelopeSchema>;
