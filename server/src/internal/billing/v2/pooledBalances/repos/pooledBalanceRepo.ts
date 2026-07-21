import {
	customerEntitlements,
	customers,
	type DbCustomerEntitlement,
	type DbPooledBalance,
	type DbPooledBalanceContribution,
	entitlements,
	type InsertCustomerEntitlement,
	type InsertPooledBalance,
	type InsertPooledBalanceContribution,
	InternalError,
	pooledBalanceContributions,
	pooledBalances,
} from "@autumn/shared";
import { and, eq, getTableColumns, inArray, isNull, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export type PooledBalanceDb = Pick<
	DrizzleCli,
	"query" | "select" | "insert" | "update" | "delete"
>;

export type PooledBalanceLookup = {
	internal_customer_id: InsertPooledBalance["internal_customer_id"];
	internal_feature_id: InsertPooledBalance["internal_feature_id"];
	interval: InsertPooledBalance["interval"];
	interval_count: number;
	reset_cycle_anchor: number | null;
	reset_mode: InsertPooledBalance["reset_mode"];
	rollover_signature: string;
};

const lockCustomer = async ({
	db,
	internalCustomerId,
}: {
	db: PooledBalanceDb;
	internalCustomerId: string;
}) => {
	const rows = await db
		.select({ internalId: customers.internal_id })
		.from(customers)
		.where(eq(customers.internal_id, internalCustomerId))
		.for("update");
	if (rows.length > 0) return;

	throw new InternalError({
		message: `Cannot lock missing customer '${internalCustomerId}' for pooled balance update.`,
	});
};

const findByLookup = async ({
	db,
	lookup,
}: {
	db: PooledBalanceDb;
	lookup: PooledBalanceLookup;
}): Promise<DbPooledBalance | undefined> =>
	db.query.pooledBalances.findFirst({
		where: and(
			eq(pooledBalances.internal_customer_id, lookup.internal_customer_id),
			eq(pooledBalances.internal_feature_id, lookup.internal_feature_id),
			eq(pooledBalances.interval, lookup.interval),
			eq(pooledBalances.interval_count, lookup.interval_count ?? 1),
			lookup.reset_cycle_anchor === null
				? isNull(pooledBalances.reset_cycle_anchor)
				: eq(pooledBalances.reset_cycle_anchor, lookup.reset_cycle_anchor),
			eq(pooledBalances.reset_mode, lookup.reset_mode),
			eq(pooledBalances.rollover_signature, lookup.rollover_signature),
		),
	});

const insertPoolGraph = async ({
	db,
	entitlement,
	customerEntitlement,
	pool,
}: {
	db: PooledBalanceDb;
	entitlement: typeof entitlements.$inferInsert;
	customerEntitlement: InsertCustomerEntitlement;
	pool: InsertPooledBalance;
}): Promise<DbPooledBalance> => {
	await db.insert(entitlements).values(entitlement);
	await db.insert(customerEntitlements).values(customerEntitlement);
	const [insertedPool] = await db
		.insert(pooledBalances)
		.values(pool)
		.returning();
	if (insertedPool) return insertedPool;

	throw new InternalError({
		message: "Failed to insert pooled balance.",
	});
};

const findContribution = async ({
	db,
	sourceCustomerProductId,
	sourceEntitlementId,
}: {
	db: PooledBalanceDb;
	sourceCustomerProductId: string;
	sourceEntitlementId: string;
}): Promise<DbPooledBalanceContribution | undefined> =>
	db.query.pooledBalanceContributions.findFirst({
		where: and(
			eq(
				pooledBalanceContributions.source_customer_product_id,
				sourceCustomerProductId,
			),
			eq(pooledBalanceContributions.source_entitlement_id, sourceEntitlementId),
		),
	});

const findContributionById = async ({
	db,
	contributionId,
}: {
	db: PooledBalanceDb;
	contributionId: string;
}): Promise<DbPooledBalanceContribution | undefined> =>
	db.query.pooledBalanceContributions.findFirst({
		where: eq(pooledBalanceContributions.id, contributionId),
	});

const listContributionsBySourceCustomerProduct = async ({
	db,
	sourceCustomerProductId,
}: {
	db: PooledBalanceDb;
	sourceCustomerProductId: string;
}): Promise<DbPooledBalanceContribution[]> =>
	db.query.pooledBalanceContributions.findMany({
		where: eq(
			pooledBalanceContributions.source_customer_product_id,
			sourceCustomerProductId,
		),
	});

const listContributionsBySourceCustomerProductIds = async ({
	db,
	sourceCustomerProductIds,
}: {
	db: PooledBalanceDb;
	sourceCustomerProductIds: string[];
}): Promise<DbPooledBalanceContribution[]> => {
	if (sourceCustomerProductIds.length === 0) return [];

	return db.query.pooledBalanceContributions.findMany({
		where: inArray(
			pooledBalanceContributions.source_customer_product_id,
			sourceCustomerProductIds,
		),
	});
};

const findById = async ({
	db,
	pooledBalanceId,
}: {
	db: PooledBalanceDb;
	pooledBalanceId: string;
}): Promise<DbPooledBalance | undefined> =>
	db.query.pooledBalances.findFirst({
		where: eq(pooledBalances.id, pooledBalanceId),
	});

const listByIds = async ({
	db,
	pooledBalanceIds,
}: {
	db: PooledBalanceDb;
	pooledBalanceIds: string[];
}): Promise<DbPooledBalance[]> => {
	if (pooledBalanceIds.length === 0) return [];

	return db.query.pooledBalances.findMany({
		where: inArray(pooledBalances.id, pooledBalanceIds),
	});
};

const listByInternalCustomerAndFeatureIds = async ({
	db,
	internalCustomerId,
	internalFeatureIds,
}: {
	db: PooledBalanceDb;
	internalCustomerId: string;
	internalFeatureIds: string[];
}): Promise<DbPooledBalance[]> => {
	if (internalFeatureIds.length === 0) return [];

	return db.query.pooledBalances.findMany({
		where: and(
			eq(pooledBalances.internal_customer_id, internalCustomerId),
			inArray(pooledBalances.internal_feature_id, internalFeatureIds),
		),
	});
};

export type ContributionOwnerFilter =
	| { stripeSubscriptionId: string }
	| { customerLicenseLinkId: string };

const contributionOwnerCondition = (owner: ContributionOwnerFilter) =>
	"stripeSubscriptionId" in owner
		? eq(
				pooledBalanceContributions.stripe_subscription_id,
				owner.stripeSubscriptionId,
			)
		: eq(
				pooledBalanceContributions.customer_license_link_id,
				owner.customerLicenseLinkId,
			);

const listByContributionOwner = async ({
	db,
	internalCustomerId,
	owner,
}: {
	db: PooledBalanceDb;
	internalCustomerId: string;
	owner: ContributionOwnerFilter;
}): Promise<DbPooledBalance[]> => {
	const rows = await db
		.select(getTableColumns(pooledBalances))
		.from(pooledBalances)
		.innerJoin(
			pooledBalanceContributions,
			eq(pooledBalanceContributions.pooled_balance_id, pooledBalances.id),
		)
		.where(
			and(
				eq(pooledBalances.internal_customer_id, internalCustomerId),
				contributionOwnerCondition(owner),
			),
		);

	return [...new Map(rows.map((pool) => [pool.id, pool])).values()];
};

const listContributionsByOwner = async ({
	db,
	internalCustomerId,
	owner,
}: {
	db: PooledBalanceDb;
	internalCustomerId: string;
	owner: ContributionOwnerFilter;
}): Promise<DbPooledBalanceContribution[]> =>
	db
		.select(getTableColumns(pooledBalanceContributions))
		.from(pooledBalanceContributions)
		.innerJoin(
			pooledBalances,
			eq(pooledBalanceContributions.pooled_balance_id, pooledBalances.id),
		)
		.where(
			and(
				eq(pooledBalances.internal_customer_id, internalCustomerId),
				contributionOwnerCondition(owner),
			),
		);

const findByCustomerEntitlementId = async ({
	db,
	customerEntitlementId,
}: {
	db: PooledBalanceDb;
	customerEntitlementId: string;
}): Promise<DbPooledBalance | undefined> =>
	db.query.pooledBalances.findFirst({
		where: eq(pooledBalances.customer_entitlement_id, customerEntitlementId),
	});

const findCustomerEntitlementById = async ({
	db,
	customerEntitlementId,
}: {
	db: PooledBalanceDb;
	customerEntitlementId: string;
}): Promise<DbCustomerEntitlement | undefined> =>
	db.query.customerEntitlements.findFirst({
		where: eq(customerEntitlements.id, customerEntitlementId),
	});

const listContributionsByPoolId = async ({
	db,
	pooledBalanceId,
}: {
	db: PooledBalanceDb;
	pooledBalanceId: string;
}): Promise<DbPooledBalanceContribution[]> =>
	db.query.pooledBalanceContributions.findMany({
		where: eq(pooledBalanceContributions.pooled_balance_id, pooledBalanceId),
	});

const listContributionsByPoolIds = async ({
	db,
	pooledBalanceIds,
}: {
	db: PooledBalanceDb;
	pooledBalanceIds: string[];
}): Promise<DbPooledBalanceContribution[]> => {
	if (pooledBalanceIds.length === 0) return [];

	return db.query.pooledBalanceContributions.findMany({
		where: inArray(
			pooledBalanceContributions.pooled_balance_id,
			pooledBalanceIds,
		),
	});
};

const insertContribution = async ({
	db,
	contribution,
}: {
	db: PooledBalanceDb;
	contribution: InsertPooledBalanceContribution;
}) => {
	await db.insert(pooledBalanceContributions).values(contribution);
};

const normalizeSourceCustomerEntitlement = async ({
	db,
	sourceCustomerProductId,
	sourceEntitlementId,
}: {
	db: PooledBalanceDb;
	sourceCustomerProductId: string;
	sourceEntitlementId: string;
}) => {
	const rows = await db
		.update(customerEntitlements)
		.set({
			balance: 0,
			adjustment: 0,
			additional_balance: 0,
			entities: null,
		})
		.where(
			and(
				eq(customerEntitlements.customer_product_id, sourceCustomerProductId),
				eq(customerEntitlements.entitlement_id, sourceEntitlementId),
			),
		)
		.returning({ id: customerEntitlements.id });

	if (rows.length > 0) return;
	throw new InternalError({
		message: `Pooled source entitlement '${sourceEntitlementId}' was not found on customer product '${sourceCustomerProductId}'.`,
	});
};

const updateContribution = async ({
	db,
	contributionId,
	currentContribution,
	nextCycleContribution,
	owner,
	updatedAt,
	effectiveAt,
}: {
	db: PooledBalanceDb;
	contributionId: string;
	currentContribution: number;
	nextCycleContribution: number;
	/** Both columns are rewritten together; null owner = free (lazy resets). */
	owner?: {
		stripeSubscriptionId: string | null;
		customerLicenseLinkId: string | null;
	};
	updatedAt: number;
	effectiveAt?: number | null;
}) => {
	await db
		.update(pooledBalanceContributions)
		.set({
			current_contribution: currentContribution,
			next_cycle_contribution: nextCycleContribution,
			...(owner !== undefined
				? {
						stripe_subscription_id: owner.stripeSubscriptionId,
						customer_license_link_id: owner.customerLicenseLinkId,
					}
				: {}),
			...(effectiveAt !== undefined ? { effective_at: effectiveAt } : {}),
			updated_at: updatedAt,
		})
		.where(eq(pooledBalanceContributions.id, contributionId));
};

const transferContribution = async ({
	db,
	contributionId,
	pooledBalanceId,
	sourceEntitlementId,
	owner,
	currentContribution,
	nextCycleContribution,
	updatedAt,
}: {
	db: PooledBalanceDb;
	contributionId: string;
	pooledBalanceId: string;
	sourceEntitlementId: string;
	owner: {
		stripeSubscriptionId: string | null;
		customerLicenseLinkId: string | null;
	};
	currentContribution: number;
	nextCycleContribution: number;
	updatedAt: number;
}) => {
	await db
		.update(pooledBalanceContributions)
		.set({
			pooled_balance_id: pooledBalanceId,
			source_entitlement_id: sourceEntitlementId,
			stripe_subscription_id: owner.stripeSubscriptionId,
			customer_license_link_id: owner.customerLicenseLinkId,
			current_contribution: currentContribution,
			next_cycle_contribution: nextCycleContribution,
			effective_at: null,
			updated_at: updatedAt,
		})
		.where(eq(pooledBalanceContributions.id, contributionId));
};

const incrementBalanceAndAdjustmentDeltas = async ({
	db,
	customerEntitlementId,
	balanceDelta,
	adjustmentDelta,
}: {
	db: PooledBalanceDb;
	customerEntitlementId: string;
	balanceDelta: number;
	adjustmentDelta: number;
}) => {
	if (balanceDelta === 0 && adjustmentDelta === 0) return;

	const rows = await db
		.update(customerEntitlements)
		.set({
			balance: sql`${customerEntitlements.balance} + ${balanceDelta}`,
			adjustment: sql`COALESCE(${customerEntitlements.adjustment}, 0) + ${adjustmentDelta}`,
		})
		.where(eq(customerEntitlements.id, customerEntitlementId))
		.returning({ id: customerEntitlements.id });
	if (rows.length > 0) return;

	throw new InternalError({
		message: `Pooled customer entitlement '${customerEntitlementId}' not found.`,
	});
};

const setBalanceAndAdjustment = async ({
	db,
	customerEntitlementId,
	balance,
	adjustment,
}: {
	db: PooledBalanceDb;
	customerEntitlementId: string;
	balance: number;
	adjustment: number;
}) => {
	const rows = await db
		.update(customerEntitlements)
		.set({ balance, adjustment })
		.where(eq(customerEntitlements.id, customerEntitlementId))
		.returning({ id: customerEntitlements.id });
	if (rows.length > 0) return;

	throw new InternalError({
		message: `Pooled reconciliation customer entitlement '${customerEntitlementId}' not found.`,
	});
};

const incrementBalanceAndAdjustment = async ({
	db,
	customerEntitlementId,
	delta,
}: {
	db: PooledBalanceDb;
	customerEntitlementId: string;
	delta: number;
}) =>
	incrementBalanceAndAdjustmentDeltas({
		db,
		customerEntitlementId,
		balanceDelta: delta,
		adjustmentDelta: delta,
	});

const deleteGraphsByInternalCustomerIds = async ({
	db,
	internalCustomerIds,
}: {
	db: PooledBalanceDb;
	internalCustomerIds: string[];
}) => {
	if (internalCustomerIds.length === 0) return;

	const poolOwnedEntitlements = await db
		.select({ entitlementId: customerEntitlements.entitlement_id })
		.from(pooledBalances)
		.innerJoin(
			customerEntitlements,
			eq(customerEntitlements.id, pooledBalances.customer_entitlement_id),
		)
		.where(inArray(pooledBalances.internal_customer_id, internalCustomerIds));
	if (poolOwnedEntitlements.length === 0) return;

	await db
		.delete(pooledBalances)
		.where(inArray(pooledBalances.internal_customer_id, internalCustomerIds));
	await db.delete(entitlements).where(
		inArray(
			entitlements.id,
			poolOwnedEntitlements.map(({ entitlementId }) => entitlementId),
		),
	);
};

const deleteGraphsByOrgId = async ({
	db,
	orgId,
}: {
	db: PooledBalanceDb;
	orgId: string;
}) => {
	const rows = await db
		.select({ internalCustomerId: pooledBalances.internal_customer_id })
		.from(pooledBalances)
		.where(eq(pooledBalances.org_id, orgId));

	return deleteGraphsByInternalCustomerIds({
		db,
		internalCustomerIds: rows.map(
			({ internalCustomerId }) => internalCustomerId,
		),
	});
};

const applyReset = async ({
	db,
	pool,
	expectedNextResetAt,
	nextResetAt,
	balance,
	adjustment,
	contributions,
	now,
}: {
	db: PooledBalanceDb;
	pool: DbPooledBalance;
	expectedNextResetAt: number;
	nextResetAt: number;
	balance: number;
	adjustment: number;
	contributions: Array<{
		id: string;
		currentCycleContribution: number;
		nextCycleContribution: number;
		effectiveAt?: number | null;
	}>;
	now: number;
}): Promise<boolean> => {
	const updatedCustomerEntitlements = await db
		.update(customerEntitlements)
		.set({
			balance,
			adjustment,
			additional_balance: 0,
			next_reset_at: nextResetAt,
		})
		.where(
			and(
				eq(customerEntitlements.id, pool.customer_entitlement_id),
				eq(customerEntitlements.next_reset_at, expectedNextResetAt),
			),
		)
		.returning({ id: customerEntitlements.id });
	if (updatedCustomerEntitlements.length === 0) return false;

	await db
		.update(pooledBalances)
		.set({
			last_applied_reset_at: expectedNextResetAt,
			updated_at: now,
		})
		.where(eq(pooledBalances.id, pool.id));

	for (const contribution of contributions) {
		await updateContribution({
			db,
			contributionId: contribution.id,
			currentContribution: contribution.currentCycleContribution,
			nextCycleContribution: contribution.nextCycleContribution,
			effectiveAt: contribution.effectiveAt,
			updatedAt: now,
		});
	}

	return true;
};

export const pooledBalanceRepo = {
	lockCustomer,
	findByLookup,
	insertPoolGraph,
	findContribution,
	findContributionById,
	listContributionsBySourceCustomerProduct,
	listContributionsBySourceCustomerProductIds,
	findById,
	listByIds,
	listByInternalCustomerAndFeatureIds,
	listByContributionOwner,
	listContributionsByOwner,
	findByCustomerEntitlementId,
	findCustomerEntitlementById,
	listContributionsByPoolId,
	listContributionsByPoolIds,
	insertContribution,
	normalizeSourceCustomerEntitlement,
	updateContribution,
	transferContribution,
	incrementBalanceAndAdjustment,
	incrementBalanceAndAdjustmentDeltas,
	setBalanceAndAdjustment,
	deleteGraphsByInternalCustomerIds,
	deleteGraphsByOrgId,
	applyReset,
};
