import {
	CusProductSchema,
	CustomerEntitlementSchema,
	CustomerPriceSchema,
	CustomerSchema,
	EntitySchema,
	RolloverSchema,
	UsageWindowSchema,
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
		spend_limits: true,
		overage_allowed: true,
		usage_limits: true,
	}),
	customer_products: z.array(CusProductSchema),
	customer_prices: z.array(CustomerPriceSchema),
	customer_entitlements: z.array(CustomerEntitlementSchema),
	rollovers: z.array(RolloverSchema),
	usage_windows: z.array(UsageWindowSchema),
	entity: EntitySchema.nullable(),
});

export type SubjectRowsEnvelope = z.infer<typeof subjectRowsEnvelopeSchema>;
