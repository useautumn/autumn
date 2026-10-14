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

export const subjectRowsEnvelopeSchema = z.object({
	customer: CustomerSchema,
	customer_products: z.array(
		CusProductSchema.extend({ api_semver: z.string().nullable() }),
	),
	customer_prices: z.array(CustomerPriceSchema),
	customer_entitlements: z.array(CustomerEntitlementSchema),
	rollovers: z.array(RolloverSchema),
	replaceables: z.array(ReplaceableSchema),
	usage_windows: z.array(UsageWindowSchema),
	pooled_balances: z.array(PooledBalanceSchema),
	customer_licenses: z.array(CustomerLicenseRowSchema),
	open_locks: z.array(z.object({ id: z.string(), lock_id: z.string() })),
	entity: EntitySchema.nullable(),
});

export type SubjectRowsEnvelope = z.infer<typeof subjectRowsEnvelopeSchema>;
