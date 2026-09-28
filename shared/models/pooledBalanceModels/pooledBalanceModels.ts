import { z } from "zod/v4";
import { EntInterval } from "../productModels/intervals/entitlementInterval.js";
import { PooledBalanceResetMode } from "./pooledBalanceTable.js";

/** A pooled_balances row as Postgres returns it; the columns mirror the table one for one. */
export const PooledBalanceSchema = z.object({
	id: z.string(),
	org_id: z.string(),
	env: z.string(),
	internal_customer_id: z.string(),
	internal_feature_id: z.string(),
	unlimited: z.boolean(),
	granted: z.number(),
	interval: z.enum(EntInterval),
	interval_count: z.number(),
	reset_cycle_anchor: z.number().nullable(),
	reset_mode: z.enum(PooledBalanceResetMode),
	stripe_subscription_id: z.string().nullable(),
	customer_license_link_id: z.string().nullable(),
	rollover_signature: z.string(),
	customer_entitlement_id: z.string(),
	last_applied_reset_at: z.number().nullable(),
	expires_at: z.number().nullable(),
	created_at: z.number(),
	updated_at: z.number(),
});

export type PooledBalance = z.infer<typeof PooledBalanceSchema>;
