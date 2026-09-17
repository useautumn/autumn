import {
	CusProductSchema,
	CustomerEntitlementSchema,
	EntitySchema,
	RolloverSchema,
} from "@autumn/shared";
import { z } from "zod/v4";

/** One customer's own rows as Postgres returns them; the catalog rows they reference come from getCatalogRows. */
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
});

export type SubjectRowsEnvelope = z.infer<typeof subjectRowsEnvelopeSchema>;
