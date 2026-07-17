import {
	customerEntitlements as customerEntitlementsTable,
	type FullCusEntWithFullCusProduct,
	type FullCusEntWithProduct,
	InternalError,
	PooledBalanceResetMode,
	type PooledBalanceResetOwnerType,
	type Rollover,
} from "@autumn/shared";
import { eq } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	type CustomerBalanceSyncDb,
	withCustomerBalanceSyncLock,
} from "@/internal/balances/utils/sync/withCustomerBalanceSyncLock.js";
import { invalidateCachedFullSubject } from "@/internal/customers/cache/fullSubject/index.js";
import { RolloverService } from "@/internal/customers/cusProducts/cusEnts/cusRollovers/RolloverService.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { pooledBalanceResetOwnerTypeToMode } from "../compute/computePooledBalanceLookup.js";
import {
	type PooledBalanceDb,
	pooledBalanceRepo,
} from "../repos/pooledBalanceRepo.js";
import { isSyntheticPooledBalanceCustomerEntitlement } from "../utils/pooledCustomerEntitlementClassification.js";
import { computePooledBalanceResetPlan } from "./computePooledBalanceResetPlan.js";
import { getNextPooledBalanceResetAt } from "./getNextPooledBalanceResetAt.js";
import { persistPooledBalanceResetPlan } from "./persistPooledBalanceResetPlan.js";

export type PooledCustomerEntitlementReset = {
	customerEntitlementId: string;
	featureId: string;
	resetAt: number;
	balance: number;
	adjustment: number;
	nextResetAt: number;
	applied: boolean;
	rolloverInsert?: {
		rows: Rollover[];
		fullCusEnt: FullCusEntWithProduct;
		startingBalanceOverride: number;
	};
};

const findFullPooledCustomerEntitlement = async ({
	db,
	customerEntitlementId,
}: {
	db: PooledBalanceDb;
	customerEntitlementId: string;
}): Promise<FullCusEntWithProduct | null> => {
	const customerEntitlement = await db.query.customerEntitlements.findFirst({
		where: eq(customerEntitlementsTable.id, customerEntitlementId),
		with: {
			entitlement: { with: { feature: true } },
			replaceables: true,
		},
	});
	if (!customerEntitlement) return null;

	return {
		...customerEntitlement,
		rollovers: [],
		customer_product: null,
	} as FullCusEntWithProduct;
};

const resetPooledBalance = async ({
	ctx,
	pooledBalanceId,
	asOf,
	expectedResetMode,
	customerEntitlementSnapshot,
	subscriptionNextResetAt,
	balanceSyncDb,
	customerLockHeld = false,
}: {
	ctx: AutumnContext;
	pooledBalanceId: string;
	asOf: number;
	expectedResetMode?: PooledBalanceResetMode;
	customerEntitlementSnapshot?: FullCusEntWithProduct;
	subscriptionNextResetAt?: number;
	balanceSyncDb?: CustomerBalanceSyncDb;
	customerLockHeld?: boolean;
}): Promise<PooledCustomerEntitlementReset | null> => {
	const executeReset = async ({
		db,
	}: {
		db: PooledBalanceDb;
	}): Promise<PooledCustomerEntitlementReset | null> => {
		const initialPool = await pooledBalanceRepo.findById({
			db,
			pooledBalanceId,
		});
		if (
			!initialPool ||
			initialPool.reset_mode === PooledBalanceResetMode.Lifetime ||
			(expectedResetMode !== undefined &&
				initialPool.reset_mode !== expectedResetMode)
		) {
			return null;
		}
		const featureId = ctx.features.find(
			(feature) => feature.internal_id === initialPool.internal_feature_id,
		)?.id;
		if (!featureId) {
			throw new InternalError({
				message: `Feature '${initialPool.internal_feature_id}' not found while resetting pooled balance.`,
			});
		}

		if (!customerLockHeld) {
			await pooledBalanceRepo.lockCustomer({
				db,
				internalCustomerId: initialPool.internal_customer_id,
			});
		}

		const pool = await pooledBalanceRepo.findById({
			db,
			pooledBalanceId,
		});
		if (
			!pool ||
			pool.reset_mode === PooledBalanceResetMode.Lifetime ||
			(expectedResetMode !== undefined && pool.reset_mode !== expectedResetMode)
		) {
			return null;
		}
		const storedCustomerEntitlement = await findFullPooledCustomerEntitlement({
			db,
			customerEntitlementId: pool.customer_entitlement_id,
		});
		const resetAt = storedCustomerEntitlement?.next_reset_at;
		if (
			!storedCustomerEntitlement ||
			typeof resetAt !== "number" ||
			resetAt > asOf ||
			typeof pool.reset_cycle_anchor !== "number"
		) {
			return null;
		}
		const nextResetAt = await getNextPooledBalanceResetAt({
			ctx,
			resetMode: pool.reset_mode,
			currentResetAt: resetAt,
			interval: pool.interval,
			intervalCount: pool.interval_count,
			subscriptionNextResetAt,
		});
		if (nextResetAt === null) return null;

		const contributions = await pooledBalanceRepo.listContributionsByPoolId({
			db,
			pooledBalanceId: pool.id,
		});
		const currentRollovers = customerEntitlementSnapshot
			? customerEntitlementSnapshot.rollovers
			: await RolloverService.getCurrentRollovers({
					ctx: { db },
					cusEntID: storedCustomerEntitlement.id,
				});
		const customerEntitlement = customerEntitlementSnapshot
			? {
					...storedCustomerEntitlement,
					balance: customerEntitlementSnapshot.balance,
					entities: customerEntitlementSnapshot.entities,
					rollovers: currentRollovers,
				}
			: { ...storedCustomerEntitlement, rollovers: currentRollovers };
		const resetPlan = computePooledBalanceResetPlan({
			customerEntitlement,
			resetAt,
			asOf,
			lastAppliedResetAt: pool.last_applied_reset_at,
			contributions: contributions.map((contribution) => ({
				id: contribution.id,
				currentCycleContribution: contribution.current_contribution,
				nextCycleContribution: contribution.next_cycle_contribution,
				effectiveAt: contribution.effective_at,
			})),
		});

		if (resetPlan) {
			const applied = await persistPooledBalanceResetPlan({
				plan: resetPlan,
				applyReset: ({ reset }) =>
					pooledBalanceRepo.applyReset({
						db,
						pool,
						expectedNextResetAt: resetAt,
						nextResetAt,
						balance: reset.resetBalance,
						adjustment: reset.resetAdjustment,
						contributions: reset.contributions,
						now: Date.now(),
					}),
				insertRollovers: async ({ rolloverInsert, startingBalance }) => {
					await RolloverService.insert({
						ctx: { db },
						rows: rolloverInsert.rows,
						fullCusEnt: rolloverInsert.fullCusEnt,
						startingBalanceOverride: startingBalance,
					});
				},
			});
			if (applied) {
				return {
					customerEntitlementId: pool.customer_entitlement_id,
					featureId,
					resetAt,
					balance: resetPlan.reset.resetBalance,
					adjustment: resetPlan.reset.resetAdjustment,
					nextResetAt,
					applied: true,
					...(resetPlan.rolloverInsert
						? { rolloverInsert: resetPlan.rolloverInsert }
						: {}),
				};
			}
		}

		const currentCustomerEntitlement =
			await pooledBalanceRepo.findCustomerEntitlementById({
				db,
				customerEntitlementId: pool.customer_entitlement_id,
			});
		if (!currentCustomerEntitlement) return null;

		return {
			customerEntitlementId: pool.customer_entitlement_id,
			featureId,
			resetAt,
			balance: currentCustomerEntitlement.balance,
			adjustment: currentCustomerEntitlement.adjustment ?? 0,
			nextResetAt: currentCustomerEntitlement.next_reset_at ?? nextResetAt,
			applied: false,
		};
	};

	if (balanceSyncDb) {
		return executeReset({ db: balanceSyncDb });
	}

	return ctx.db.transaction((transaction) => executeReset({ db: transaction }));
};

const resetPooledCustomerEntitlement = async ({
	ctx,
	customerEntitlement,
	asOf,
	balanceSyncDb,
	customerLockHeld = false,
}: {
	ctx: AutumnContext;
	customerEntitlement: FullCusEntWithFullCusProduct;
	asOf: number;
	balanceSyncDb?: CustomerBalanceSyncDb;
	customerLockHeld?: boolean;
}): Promise<PooledCustomerEntitlementReset | null> => {
	const pool = await pooledBalanceRepo.findByCustomerEntitlementId({
		db: balanceSyncDb ?? ctx.db,
		customerEntitlementId: customerEntitlement.id,
	});
	if (
		!pool ||
		pool.reset_mode === PooledBalanceResetMode.Subscription ||
		pool.reset_mode === PooledBalanceResetMode.Lifetime
	) {
		return null;
	}

	return resetPooledBalance({
		ctx,
		pooledBalanceId: pool.id,
		asOf,
		expectedResetMode: pool.reset_mode,
		balanceSyncDb,
		customerLockHeld,
	});
};

export type ResetPooledBalancesByOwnerDependencies = {
	listPools: typeof pooledBalanceRepo.listByResetOwner;
	lockCustomer: typeof pooledBalanceRepo.lockCustomer;
	invalidateCachedSubject: typeof invalidateCachedFullSubject;
	resetPool: typeof resetPooledBalance;
	invalidateCachesAfterFailure?: typeof deleteCachedFullCustomer;
};

export const resetPooledBalancesByResetOwnerWithDependencies = async ({
	ctx,
	customerId,
	internalCustomerId,
	resetOwnerType,
	resetOwnerId,
	now,
	subscriptionNextResetAt,
	balanceSyncDb,
	dependencies = {
		listPools: pooledBalanceRepo.listByResetOwner,
		lockCustomer: pooledBalanceRepo.lockCustomer,
		invalidateCachedSubject: invalidateCachedFullSubject,
		resetPool: resetPooledBalance,
	},
}: {
	ctx: AutumnContext;
	customerId: string;
	internalCustomerId: string;
	resetOwnerType: PooledBalanceResetOwnerType;
	resetOwnerId: string;
	now: number;
	/** Stripe invoice period end for subscription-owned pools. */
	subscriptionNextResetAt?: number;
	/** Existing customer balance-sync transaction. */
	balanceSyncDb?: CustomerBalanceSyncDb;
	dependencies?: ResetPooledBalancesByOwnerDependencies;
}): Promise<PooledCustomerEntitlementReset[]> => {
	const expectedResetMode = pooledBalanceResetOwnerTypeToMode({
		resetOwnerType,
	});

	const executeReset = async ({ db }: { db: CustomerBalanceSyncDb }) => {
		const pools = await dependencies.listPools({
			db,
			internalCustomerId,
			resetOwnerType,
			resetOwnerId,
		});
		if (pools.length === 0) return [];
		await dependencies.lockCustomer({ db, internalCustomerId });

		await dependencies.invalidateCachedSubject({
			ctx,
			customerId,
			source: "pooled-balance-owner-reset",
			flushBalances: true,
			balanceSyncDb: db,
			balanceCaptureMode: "strict",
		});

		const results: PooledCustomerEntitlementReset[] = [];
		for (const pool of pools) {
			const result = await dependencies.resetPool({
				ctx,
				pooledBalanceId: pool.id,
				asOf: now,
				expectedResetMode,
				subscriptionNextResetAt,
				balanceSyncDb: db,
				customerLockHeld: true,
			});
			if (result) results.push(result);
		}
		return results;
	};
	if (balanceSyncDb) {
		return executeReset({ db: balanceSyncDb });
	}

	return withCustomerBalanceSyncLock({
		ctx,
		customerId,
		internalCustomerId,
		callback: executeReset,
		onTransactionFailure: () =>
			(dependencies.invalidateCachesAfterFailure ?? deleteCachedFullCustomer)({
				ctx,
				customerId,
				source: "pooled-balance-owner-reset-transaction-failure",
				flushBalances: true,
			}),
	});
};

export const resetPooledBalancesByResetOwner = async ({
	ctx,
	customerId,
	internalCustomerId,
	resetOwnerType,
	resetOwnerId,
	now,
	subscriptionNextResetAt,
	balanceSyncDb,
}: {
	ctx: AutumnContext;
	customerId: string;
	internalCustomerId: string;
	resetOwnerType: PooledBalanceResetOwnerType;
	resetOwnerId: string;
	now: number;
	subscriptionNextResetAt?: number;
	/** Existing customer balance-sync transaction. */
	balanceSyncDb?: CustomerBalanceSyncDb;
}): Promise<PooledCustomerEntitlementReset[]> =>
	resetPooledBalancesByResetOwnerWithDependencies({
		ctx,
		customerId,
		internalCustomerId,
		resetOwnerType,
		resetOwnerId,
		now,
		subscriptionNextResetAt,
		balanceSyncDb,
	});

export type ResetPooledCustomerEntitlementsDependencies = {
	lockCustomer: typeof pooledBalanceRepo.lockCustomer;
	invalidateCachedSubject: typeof invalidateCachedFullSubject;
	resetCustomerEntitlement: typeof resetPooledCustomerEntitlement;
	findCustomerEntitlementById?: typeof pooledBalanceRepo.findCustomerEntitlementById;
	invalidateCachesAfterFailure?: typeof deleteCachedFullCustomer;
};

export const resetPooledCustomerEntitlementsWithDependencies = async ({
	ctx,
	customerId,
	customerEntitlements,
	now,
	balanceSyncDb,
	dependencies = {
		lockCustomer: pooledBalanceRepo.lockCustomer,
		invalidateCachedSubject: invalidateCachedFullSubject,
		resetCustomerEntitlement: resetPooledCustomerEntitlement,
		findCustomerEntitlementById: pooledBalanceRepo.findCustomerEntitlementById,
	},
}: {
	ctx: AutumnContext;
	customerId: string;
	customerEntitlements: FullCusEntWithFullCusProduct[];
	now: number;
	/** Existing customer balance-sync transaction. Supplying it means the
	 * caller already owns the advisory lock for this customer. */
	balanceSyncDb?: CustomerBalanceSyncDb;
	dependencies?: ResetPooledCustomerEntitlementsDependencies;
}): Promise<PooledCustomerEntitlementReset[]> => {
	const candidates = customerEntitlements.filter(
		(customerEntitlement) =>
			isSyntheticPooledBalanceCustomerEntitlement({
				customerEntitlement,
				customerProduct: customerEntitlement.customer_product,
			}) &&
			typeof customerEntitlement.next_reset_at === "number" &&
			customerEntitlement.next_reset_at <= now,
	);
	if (candidates.length === 0) return [];

	const internalCustomerIds = new Set(
		candidates.map(
			(customerEntitlement) => customerEntitlement.internal_customer_id,
		),
	);
	if (internalCustomerIds.size !== 1) {
		throw new InternalError({
			message: `Lazy pooled reset for '${customerId}' received entitlements from multiple customers.`,
		});
	}
	const internalCustomerId = candidates[0].internal_customer_id;

	const executeReset = async ({ db }: { db: CustomerBalanceSyncDb }) => {
		await dependencies.lockCustomer({ db, internalCustomerId });
		await dependencies.invalidateCachedSubject({
			ctx,
			customerId,
			source: "pooled-balance-lazy-reset",
			flushBalances: true,
			balanceSyncDb: db,
			balanceCaptureMode: "strict",
		});

		const results: PooledCustomerEntitlementReset[] = [];
		for (const customerEntitlement of candidates) {
			const result = await dependencies.resetCustomerEntitlement({
				ctx,
				customerEntitlement,
				asOf: now,
				balanceSyncDb: db,
				customerLockHeld: true,
			});
			if (result) {
				results.push(result);
				continue;
			}

			const snapshotResetAt = customerEntitlement.next_reset_at;
			if (
				typeof snapshotResetAt !== "number" ||
				!dependencies.findCustomerEntitlementById
			) {
				continue;
			}
			const currentCustomerEntitlement =
				await dependencies.findCustomerEntitlementById({
					db,
					customerEntitlementId: customerEntitlement.id,
				});
			const currentResetAt = currentCustomerEntitlement?.next_reset_at;
			if (
				!currentCustomerEntitlement ||
				typeof currentResetAt !== "number" ||
				currentResetAt <= snapshotResetAt
			) {
				continue;
			}

			results.push({
				customerEntitlementId: currentCustomerEntitlement.id,
				featureId: customerEntitlement.feature_id,
				resetAt: snapshotResetAt,
				balance: currentCustomerEntitlement.balance,
				adjustment: currentCustomerEntitlement.adjustment ?? 0,
				nextResetAt: currentResetAt,
				applied: false,
			});
		}
		return results;
	};

	if (balanceSyncDb) {
		return executeReset({ db: balanceSyncDb });
	}

	return withCustomerBalanceSyncLock({
		ctx,
		customerId,
		internalCustomerId,
		callback: executeReset,
		onTransactionFailure: () =>
			(dependencies.invalidateCachesAfterFailure ?? deleteCachedFullCustomer)({
				ctx,
				customerId,
				source: "pooled-balance-lazy-reset-transaction-failure",
				flushBalances: true,
			}),
	});
};

export const resetPooledCustomerEntitlements = async ({
	ctx,
	customerId,
	customerEntitlements,
	now,
	balanceSyncDb,
}: {
	ctx: AutumnContext;
	customerId: string;
	customerEntitlements: FullCusEntWithFullCusProduct[];
	now: number;
	/** Existing customer balance-sync transaction. */
	balanceSyncDb?: CustomerBalanceSyncDb;
}): Promise<PooledCustomerEntitlementReset[]> =>
	resetPooledCustomerEntitlementsWithDependencies({
		ctx,
		customerId,
		customerEntitlements,
		now,
		balanceSyncDb,
	});
