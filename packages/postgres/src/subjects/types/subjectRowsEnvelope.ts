import {
	CusProductSchema,
	CustomerEntitlementSchema,
	CustomerSchema,
	EntitySchema,
	RolloverSchema,
} from "@autumn/shared";
import { z } from "zod/v4";

/** One customer's own rows as Postgres returns them; the catalog rows they reference come from getCatalogRows. */
export const subjectRowsEnvelopeSchema = z.object({
	customer: CustomerSchema.pick({
		internal_id: true,
		id: true,
		org_id: true,
		env: true,
		config: true,
	}),
	customer_products: z.array(CusProductSchema),
	customer_entitlements: z.array(CustomerEntitlementSchema),
	rollovers: z.array(RolloverSchema),
	entity: EntitySchema.nullable(),
});

export type SubjectRowsEnvelope = z.infer<typeof subjectRowsEnvelopeSchema>;
