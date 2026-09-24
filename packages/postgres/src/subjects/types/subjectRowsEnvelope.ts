import {
	CusProductSchema,
	CustomerEntitlementSchema,
	CustomerLicenseRowSchema,
	CustomerPriceSchema,
	CustomerSchema,
	EntitySchema,
	PooledBalanceSchema,
	ReplaceableSchema,
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
	/** A v1 allocated grant's replaceable seats; `customers.get` folds their count into the balance. */
	replaceables: z.array(ReplaceableSchema),
	usage_windows: z.array(UsageWindowSchema),
	/** The pools behind the pooled rows above. */
	pooled_balances: z.array(PooledBalanceSchema),
	/** License pools on the customer's products: seat counters the worker serves on `customers.get`. */
	customer_licenses: z.array(CustomerLicenseRowSchema),
	/** Ids only: the rest of a lock row is read at finalize, never held in memory. */
	open_locks: z.array(z.object({ id: z.string(), lock_id: z.string() })),
	entity: EntitySchema.nullable(),
});

export type SubjectRowsEnvelope = z.infer<typeof subjectRowsEnvelopeSchema>;
