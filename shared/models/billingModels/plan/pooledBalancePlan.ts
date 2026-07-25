import { z } from "zod/v4";
import type { FullCustomerEntitlement } from "../../cusProductModels/cusEntModels/cusEntModels.js";
import type {
	DbPooledBalanceContribution,
	InsertPooledBalanceContribution,
} from "../../pooledBalanceModels/pooledBalanceTable.js";

export const PooledBalanceUpdateSchema = z.object({
	pooledCustomerEntitlement: z.custom<FullCustomerEntitlement>(),
	balanceDelta: z.number(),
	grantedDelta: z.number(),
});

/** A pool that lost a contribution and may now be empty. Execution expires it
 * only if no contributions remain — the count is unbounded, so only the DB knows. */
export const PooledBalanceExpiryCandidateSchema = z.object({
	pooledCustomerEntitlement: z.custom<FullCustomerEntitlement>(),
	expiresAt: z.number(),
});

export const PooledBalancePlanSchema = z.object({
	insertPoolBalances: z.array(z.custom<FullCustomerEntitlement>()),
	updatePoolBalances: z.array(PooledBalanceUpdateSchema),
	expirePoolBalanceCandidates: z.array(PooledBalanceExpiryCandidateSchema),
	insertPoolContributions: z.array(z.custom<InsertPooledBalanceContribution>()),
	updatePoolContributions: z.array(z.custom<DbPooledBalanceContribution>()),
	deletePoolContributions: z.array(z.custom<DbPooledBalanceContribution>()),
});

export type PooledBalanceUpdate = z.infer<typeof PooledBalanceUpdateSchema>;
export type PooledBalanceExpiryCandidate = z.infer<
	typeof PooledBalanceExpiryCandidateSchema
>;
export type PooledBalancePlan = z.infer<typeof PooledBalancePlanSchema>;
