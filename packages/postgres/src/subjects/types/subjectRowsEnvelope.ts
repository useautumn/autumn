import {
	CusProductSchema,
	CustomerEntitlementSchema,
	CustomerPriceSchema,
	CustomerSchema,
	EntitySchema,
	PooledBalanceSchema,
	RolloverSchema,
	UsageWindowSchema,
} from "@autumn/shared";
import { z } from "zod/v4";

/** One customer's own rows as Postgres returns them; the catalog rows they reference come from getCatalogRows. */
export const subjectRowsEnvelopeSchema = z.object({
	/** The whole row: the worker serves `customers.get` from it, not only check and track. */
	customer: CustomerSchema,
	customer_products: z.array(CusProductSchema),
	customer_prices: z.array(CustomerPriceSchema),
	customer_entitlements: z.array(CustomerEntitlementSchema),
	rollovers: z.array(RolloverSchema),
	usage_windows: z.array(UsageWindowSchema),
	/** The pools behind the pooled rows above; the worker keeps only the grant off each. */
	pooled_balances: z.array(PooledBalanceSchema),
	/** Ids only: the rest of a lock row is read at finalize, never held in memory. */
	open_locks: z.array(z.object({ id: z.string(), lock_id: z.string() })),
	entity: EntitySchema.nullable(),
});

export type SubjectRowsEnvelope = z.infer<typeof subjectRowsEnvelopeSchema>;
