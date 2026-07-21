import {
	AllowanceType,
	type AutumnBillingPlan,
	type DbPooledBalance,
	type FullSubject,
	findFeatureByInternalId,
	InternalError,
	orgToInStatuses,
	type PooledBalanceOp,
	type PooledBalancePlan,
	type SubjectQueryRow,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	type CustomerBalanceSyncDb,
	withCustomerBalanceSyncLock,
} from "@/internal/balances/utils/sync/withCustomerBalanceSyncLock.js";
import { computePooledBalanceLookup } from "@/internal/billing/v2/pooledBalances/compute/computePooledBalanceLookup.js";
import {
	computePooledBalanceRebalance,
	computePooledBalanceUsageReapply,
	type PooledBalanceRebalanceDelta,
	type PooledBalanceUsageReapply,
} from "@/internal/billing/v2/pooledBalances/compute/computePooledBalanceRebalance.js";
import { computePooledContributionTransition } from "@/internal/billing/v2/pooledBalances/compute/computePooledContributionTransition.js";
import { computePooledTransferGrantDeltas } from "@/internal/billing/v2/pooledBalances/compute/computePooledTransferGrantDeltas.js";
import type { PooledBalanceCacheEffect } from "@/internal/billing/v2/pooledBalances/compute/pooledBalanceCacheEffects.js";
import { applyPooledBalanceCacheCutover } from "@/internal/billing/v2/pooledBalances/execute/applyPooledBalanceCacheEffects.js";
import {
	type PooledBalanceDb,
	pooledBalanceRepo,
} from "@/internal/billing/v2/pooledBalances/repos/pooledBalanceRepo.js";
import { assertSinglePoolSubscriptionOwner } from "@/internal/billing/v2/pooledBalances/utils/assertSinglePoolSubscriptionOwner.js";
import { pooledBalancePlanToOps } from "@/internal/billing/v2/pooledBalances/utils/pooledBalancePlanToOps.js";
import { getOrInitFullSubjectViewEpoch } from "@/internal/customers/cache/fullSubject/actions/invalidate/getOrInitFullSubjectViewEpoch.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import {
	getFullSubjectQuery,
	resultToFullSubject,
} from "@/internal/customers/repos/getFullSubject/index.js";
import { generateId } from "@/utils/genUtils.js";

type UpsertPooledBalanceSourceOp = Extract<
	PooledBalanceOp,
	{ op: "upsert_source" }
>;
type RemovePooledBalanceSourceOp = Extract<
	PooledBalanceOp,
	{ op: "remove_source" }
>;
type RemovePooledBalanceContributionOp = Extract<
	PooledBalanceOp,
	{ op: "remove_contribution" }
>;
type PooledBalanceRemovalOp =
	| RemovePooledBalanceSourceOp
	| RemovePooledBalanceContributionOp;
type RestorePooledBalanceSourceOp = Extract<
	PooledBalanceOp,
	{ op: "restore_source" }
>;
export type TransferPooledBalanceSourceOp = Extract<
	PooledBalanceOp,
	{ op: "transfer_source" }
>;
type PooledBalanceOwnerTransitionOp = Extract<
	PooledBalanceOp,
	{ op: "stage_owner_removal" | "restore_owner" }
>;

export type PreparedPooledBalanceCacheCutover = Omit<
	Parameters<typeof applyPooledBalanceCacheCutover>[0],
	"ctx"
>;

export const applyPreparedPooledBalanceCacheCutover = async ({
	ctx,
	prepared,
}: {
	ctx: AutumnContext;
	prepared: PreparedPooledBalanceCacheCutover;
}) =>
	withCustomerBalanceSyncLock({
		ctx,
		customerId: prepared.customerId,
		internalCustomerId: prepared.fullSubject.internalCustomerId,
		callback: ({ db }) =>
			applyPooledBalanceCacheCutover({
				ctx: { ...ctx, db },
				...prepared,
			}),
		onTransactionFailure: () =>
			deleteCachedFullCustomer({
				ctx,
				customerId: prepared.customerId,
				source: "pooled-balance-cache-cutover-transaction-failure",
				flushBalances: true,
			}),
	});

export const getContributionUsageReapply = ({
	featureId,
	usageReapply,
	previousContributionExists,
	contributionDelta,
}: {
	featureId: string;
	usageReapply?: UpsertPooledBalanceSourceOp["usageReapply"];
	previousContributionExists: boolean;
	contributionDelta: number;
}): PooledBalanceUsageReapply | undefined => {
	if (!usageReapply || (previousContributionExists && contributionDelta <= 0))
		return undefined;
	return { featureId, ...usageReapply };
};

export type PooledBalanceTransactionCallback = ({
	db,
}: {
	db: CustomerBalanceSyncDb;
}) => Promise<void>;

const pooledBalanceToFeatureId = ({
	ctx,
	pool,
}: {
	ctx: AutumnContext;
	pool: DbPooledBalance;
}): string => {
	return findFeatureByInternalId({
		features: ctx.features,
		internalId: pool.internal_feature_id,
		errorOnNotFound: true,
	}).id;
};

const pooledBalanceToCacheEffect = ({
	ctx,
	pool,
	balanceDelta,
	adjustmentDelta,
}: {
	ctx: AutumnContext;
	pool: DbPooledBalance;
	balanceDelta: number;
	adjustmentDelta: number;
}): PooledBalanceCacheEffect => ({
	featureId: pooledBalanceToFeatureId({ ctx, pool }),
	customerEntitlementId: pool.customer_entitlement_id,
	balanceDelta,
	adjustmentDelta,
});

const findOrCreatePooledBalance = async ({
	db,
	ctx,
	customerId,
	operation,
	now,
}: {
	db: PooledBalanceDb;
	ctx: AutumnContext;
	customerId: string;
	operation: UpsertPooledBalanceSourceOp | TransferPooledBalanceSourceOp;
	now: number;
}) => {
	const lookup = computePooledBalanceLookup({ operation });
	const existing = await pooledBalanceRepo.findByLookup({ db, lookup });
	if (existing) return existing;

	const entitlementId = generateId("ent");
	const customerEntitlementId = generateId("cus_ent");

	return pooledBalanceRepo.insertPoolGraph({
		db,
		entitlement: {
			id: entitlementId,
			created_at: now,
			internal_feature_id: operation.internalFeatureId,
			internal_product_id: null,
			internal_reward_id: null,
			is_custom: true,
			allowance_type: AllowanceType.Fixed,
			allowance: 0,
			interval: operation.interval,
			interval_count: operation.intervalCount,
			carry_from_previous: false,
			entity_feature_id: null,
			pooled: true,
			org_id: ctx.org.id,
			feature_id: operation.featureId,
			usage_limit: null,
			expiry_duration: null,
			expiry_length: null,
			rollover: operation.rollover ?? null,
		},
		customerEntitlement: {
			id: customerEntitlementId,
			customer_product_id: null,
			entitlement_id: entitlementId,
			internal_customer_id: operation.internalCustomerId,
			internal_entity_id: null,
			internal_feature_id: operation.internalFeatureId,
			unlimited: false,
			balance: 0,
			created_at: now,
			reset_cycle_anchor: operation.resetCycleAnchor,
			next_reset_at: operation.nextResetAt,
			usage_allowed: false,
			separate_interval: false,
			adjustment: 0,
			additional_balance: 0,
			entities: null,
			expires_at: null,
			cache_version: 0,
			customer_id: customerId,
			feature_id: operation.featureId,
			external_id: null,
			expired: false,
		},
		pool: {
			id: generateId("pooled_balance"),
			org_id: ctx.org.id,
			env: ctx.env,
			...lookup,
			customer_entitlement_id: customerEntitlementId,
			last_applied_reset_at: null,
			created_at: now,
			updated_at: now,
		},
	});
};

const executeUpsertPooledBalanceSource = async ({
	ctx,
	customerId,
	operation,
}: {
	ctx: AutumnContext;
	customerId: string;
	operation: UpsertPooledBalanceSourceOp;
}) => {
	const cacheAdjustment = await ctx.db.transaction(async (transaction) => {
		const db: PooledBalanceDb = transaction;
		await pooledBalanceRepo.lockCustomer({
			db,
			internalCustomerId: operation.internalCustomerId,
		});

		const now = Date.now();
		const pool = await findOrCreatePooledBalance({
			db,
			ctx,
			customerId,
			operation,
			now,
		});
		if (operation.stripeSubscriptionId) {
			assertSinglePoolSubscriptionOwner({
				pooledBalanceId: pool.id,
				poolContributions: await pooledBalanceRepo.listContributionsByPoolId({
					db,
					pooledBalanceId: pool.id,
				}),
				sourceCustomerProductId: operation.sourceCustomerProductId,
				stripeSubscriptionId: operation.stripeSubscriptionId,
			});
		}

		const previousContribution = await pooledBalanceRepo.findContribution({
			db,
			sourceCustomerProductId: operation.sourceCustomerProductId,
			sourceEntitlementId: operation.sourceEntitlementId,
		});
		await pooledBalanceRepo.normalizeSourceCustomerEntitlement({
			db,
			sourceCustomerProductId: operation.sourceCustomerProductId,
			sourceEntitlementId: operation.sourceEntitlementId,
		});
		if (
			previousContribution &&
			previousContribution.pooled_balance_id !== pool.id
		) {
			throw new InternalError({
				message: `Pooled contribution '${previousContribution.id}' cannot move between pools without an explicit transfer.`,
			});
		}

		const transition = computePooledContributionTransition({
			previous: previousContribution
				? {
						currentCycleContribution: previousContribution.current_contribution,
						nextCycleContribution: previousContribution.next_cycle_contribution,
					}
				: null,
			desired: {
				currentCycleContribution: operation.currentCycleContribution,
				nextCycleContribution: operation.nextCycleContribution,
			},
		});

		if (previousContribution) {
			await pooledBalanceRepo.updateContribution({
				db,
				contributionId: previousContribution.id,
				currentContribution: transition.next.currentCycleContribution,
				nextCycleContribution: transition.next.nextCycleContribution,
				owner: {
					stripeSubscriptionId: operation.stripeSubscriptionId,
					customerLicenseLinkId: operation.customerLicenseLinkId,
				},
				updatedAt: now,
			});
		} else {
			await pooledBalanceRepo.insertContribution({
				db,
				contribution: {
					id: generateId("pooled_contribution"),
					pooled_balance_id: pool.id,
					source_customer_product_id: operation.sourceCustomerProductId,
					source_entitlement_id: operation.sourceEntitlementId,
					stripe_subscription_id: operation.stripeSubscriptionId,
					customer_license_link_id: operation.customerLicenseLinkId,
					current_contribution: transition.next.currentCycleContribution,
					next_cycle_contribution: transition.next.nextCycleContribution,
					effective_at: null,
					created_at: now,
					updated_at: now,
				},
			});
		}

		await pooledBalanceRepo.incrementBalanceAndAdjustment({
			db,
			customerEntitlementId: pool.customer_entitlement_id,
			delta: transition.contributionDelta,
		});

		return {
			pool,
			delta: transition.contributionDelta,
			usageReapply: getContributionUsageReapply({
				featureId: operation.featureId,
				usageReapply: operation.usageReapply,
				previousContributionExists: Boolean(previousContribution),
				contributionDelta: transition.contributionDelta,
			}),
		};
	});

	if (cacheAdjustment.delta === 0 && !cacheAdjustment.usageReapply) {
		return { affectedFeatureIds: [], cacheEffects: [], usageReapplies: [] };
	}

	return {
		affectedFeatureIds: [operation.featureId],
		cacheEffects:
			cacheAdjustment.delta === 0
				? []
				: [
						pooledBalanceToCacheEffect({
							ctx,
							pool: cacheAdjustment.pool,
							balanceDelta: cacheAdjustment.delta,
							adjustmentDelta: cacheAdjustment.delta,
						}),
					],
		usageReapplies: cacheAdjustment.usageReapply
			? [cacheAdjustment.usageReapply]
			: [],
	};
};

const executePooledBalanceTransferDatabaseUpdates = async ({
	ctx,
	customerId,
	internalCustomerId,
	operations,
	afterDatabaseUpdates,
}: {
	ctx: AutumnContext;
	customerId: string;
	internalCustomerId: string;
	operations: TransferPooledBalanceSourceOp[];
	afterDatabaseUpdates?: ({ db }: { db: PooledBalanceDb }) => Promise<void>;
}) => {
	const cacheAdjustments = await ctx.db.transaction(async (transaction) => {
		const db: PooledBalanceDb = transaction;
		await pooledBalanceRepo.lockCustomer({ db, internalCustomerId });
		const adjustmentsByPoolId = new Map<
			string,
			{
				pool: DbPooledBalance;
				delta: number;
				adjustmentDelta: number;
			}
		>();
		const addAdjustment = ({
			pool,
			delta,
			adjustmentDelta,
		}: {
			pool: DbPooledBalance;
			delta: number;
			adjustmentDelta: number;
		}) => {
			const previous = adjustmentsByPoolId.get(pool.id);
			adjustmentsByPoolId.set(pool.id, {
				pool,
				delta: new Decimal(previous?.delta ?? 0).plus(delta).toNumber(),
				adjustmentDelta: new Decimal(previous?.adjustmentDelta ?? 0)
					.plus(adjustmentDelta)
					.toNumber(),
			});
		};
		type TransferRecord = {
			operation: TransferPooledBalanceSourceOp;
			contribution: NonNullable<
				Awaited<ReturnType<typeof pooledBalanceRepo.findContributionById>>
			>;
			destinationPool: DbPooledBalance;
		};
		const transferRecords: TransferRecord[] = [];

		for (const operation of operations) {
			if (operation.internalCustomerId !== internalCustomerId) {
				throw new InternalError({
					message: `Pooled transfer '${operation.contributionId}' belongs to a different customer.`,
				});
			}

			const now = Date.now();
			const destinationPool = await findOrCreatePooledBalance({
				db,
				ctx,
				customerId,
				operation,
				now,
			});
			const contribution = await pooledBalanceRepo.findContributionById({
				db,
				contributionId: operation.contributionId,
			});
			if (
				!contribution ||
				contribution.source_customer_product_id !==
					operation.sourceCustomerProductId
			) {
				throw new InternalError({
					message: `Pooled contribution '${operation.contributionId}' is missing or belongs to a different source.`,
				});
			}
			transferRecords.push({ operation, contribution, destinationPool });
		}

		const previousPools = await pooledBalanceRepo.listByIds({
			db,
			pooledBalanceIds: [
				...new Set(
					transferRecords.map(
						({ contribution }) => contribution.pooled_balance_id,
					),
				),
			],
		});
		const previousPoolById = new Map(
			previousPools.map((pool) => [pool.id, pool]),
		);

		for (const record of transferRecords) {
			const { operation, contribution, destinationPool } = record;
			const previousPool = previousPoolById.get(contribution.pooled_balance_id);
			if (
				!previousPool ||
				previousPool.internal_customer_id !== internalCustomerId
			) {
				throw new InternalError({
					message: `Pooled balance '${contribution.pooled_balance_id}' is missing or belongs to a different customer.`,
				});
			}

			if (contribution.pooled_balance_id !== destinationPool.id) {
				if (
					contribution.pooled_balance_id !== operation.expectedPooledBalanceId
				) {
					throw new InternalError({
						message: `Pooled contribution '${operation.contributionId}' moved from its expected source pool.`,
					});
				}
			}
			const poolById = new Map([
				[previousPool.id, previousPool],
				[destinationPool.id, destinationPool],
			]);
			for (const delta of computePooledTransferGrantDeltas({
				previousPooledBalanceId: previousPool.id,
				destinationPooledBalanceId: destinationPool.id,
				previousContribution: contribution.current_contribution,
				desiredContribution: operation.currentCycleContribution,
			})) {
				addAdjustment({
					pool: poolById.get(delta.pooledBalanceId)!,
					delta: delta.balanceDelta,
					adjustmentDelta: delta.adjustmentDelta,
				});
			}
			await pooledBalanceRepo.transferContribution({
				db,
				contributionId: contribution.id,
				pooledBalanceId: destinationPool.id,
				sourceEntitlementId: operation.sourceEntitlementId,
				owner: {
					stripeSubscriptionId: operation.stripeSubscriptionId,
					customerLicenseLinkId: operation.customerLicenseLinkId,
				},
				currentContribution: operation.currentCycleContribution,
				nextCycleContribution: operation.nextCycleContribution,
				updatedAt: Date.now(),
			});
		}

		for (const {
			pool,
			delta,
			adjustmentDelta,
		} of adjustmentsByPoolId.values()) {
			await pooledBalanceRepo.incrementBalanceAndAdjustmentDeltas({
				db,
				customerEntitlementId: pool.customer_entitlement_id,
				balanceDelta: delta,
				adjustmentDelta,
			});
		}
		await afterDatabaseUpdates?.({ db });
		return [...adjustmentsByPoolId.values()];
	});

	return cacheAdjustments;
};

const executePooledBalanceTransfersWithLock = async ({
	ctx,
	customerId,
	internalCustomerId,
	operations,
	afterDatabaseUpdates,
}: {
	ctx: AutumnContext;
	customerId: string;
	internalCustomerId: string;
	operations: TransferPooledBalanceSourceOp[];
	afterDatabaseUpdates?: ({ db }: { db: PooledBalanceDb }) => Promise<void>;
}) => {
	const expectedSubjectViewEpoch = await getOrInitFullSubjectViewEpoch({
		ctx,
		customerId,
	});
	const adjustments = await executePooledBalanceTransferDatabaseUpdates({
		ctx,
		customerId,
		internalCustomerId,
		operations,
		afterDatabaseUpdates,
	});
	const cacheEffects = adjustments.map(({ pool, delta, adjustmentDelta }) =>
		pooledBalanceToCacheEffect({
			ctx,
			pool,
			balanceDelta: delta,
			adjustmentDelta,
		}),
	);
	const featureIds = [
		...new Set(cacheEffects.map(({ featureId }) => featureId)),
	];
	const rebalanceResult = await executePooledBalanceRebalance({
		ctx,
		customerId,
		internalCustomerId,
		featureIds,
	});
	const preparedCutover = rebalanceResult
		? ({
				customerId,
				fullSubject: rebalanceResult.fullSubject,
				featureIds,
				rawEffects: cacheEffects,
				expectedSubjectViewEpoch,
				reverseOrder: ctx.org.config?.reverse_deduction_order,
				inStatuses: rebalanceResult.inStatuses,
			} satisfies PreparedPooledBalanceCacheCutover)
		: undefined;

	return { featureIds, preparedCutover };
};

export type ExecutePooledBalanceTransfersDependencies = {
	withCustomerBalanceSyncLock: typeof withCustomerBalanceSyncLock;
	executeWithLock: typeof executePooledBalanceTransfersWithLock;
	applyCacheCutover: typeof applyPreparedPooledBalanceCacheCutover;
};

export const executePooledBalanceTransfersWithDependencies = async ({
	ctx,
	customerId,
	internalCustomerId,
	operations,
	afterDatabaseUpdates,
	dependencies = {
		withCustomerBalanceSyncLock,
		executeWithLock: executePooledBalanceTransfersWithLock,
		applyCacheCutover: applyPreparedPooledBalanceCacheCutover,
	},
}: {
	ctx: AutumnContext;
	customerId: string;
	internalCustomerId: string;
	operations: TransferPooledBalanceSourceOp[];
	afterDatabaseUpdates?: ({ db }: { db: PooledBalanceDb }) => Promise<void>;
	dependencies?: ExecutePooledBalanceTransfersDependencies;
}) => {
	const { featureIds, preparedCutover } =
		await dependencies.withCustomerBalanceSyncLock({
			ctx,
			customerId,
			internalCustomerId,
			callback: ({ db }) =>
				dependencies.executeWithLock({
					ctx: { ...ctx, db },
					customerId,
					internalCustomerId,
					operations,
					afterDatabaseUpdates,
				}),
		});
	if (preparedCutover) {
		await dependencies.applyCacheCutover({ ctx, prepared: preparedCutover });
	}
	return featureIds;
};

export const executePooledBalanceTransfers = async ({
	ctx,
	customerId,
	internalCustomerId,
	operations,
	afterDatabaseUpdates,
}: {
	ctx: AutumnContext;
	customerId: string;
	internalCustomerId: string;
	operations: TransferPooledBalanceSourceOp[];
	afterDatabaseUpdates?: ({ db }: { db: PooledBalanceDb }) => Promise<void>;
}) =>
	executePooledBalanceTransfersWithDependencies({
		ctx,
		customerId,
		internalCustomerId,
		operations,
		afterDatabaseUpdates,
	});

const executeRemovePooledBalanceSources = async ({
	ctx,
	operations,
}: {
	ctx: AutumnContext;
	operations: PooledBalanceRemovalOp[];
}) => {
	const affectedFeatureIds = new Set<string>();
	const cacheEffects: PooledBalanceCacheEffect[] = [];
	const operationsByInternalCustomerId = new Map<
		string,
		PooledBalanceRemovalOp[]
	>();
	for (const operation of operations) {
		operationsByInternalCustomerId.set(operation.internalCustomerId, [
			...(operationsByInternalCustomerId.get(operation.internalCustomerId) ??
				[]),
			operation,
		]);
	}

	for (const [
		internalCustomerId,
		customerOperations,
	] of operationsByInternalCustomerId) {
		const cacheAdjustments = await ctx.db.transaction(async (transaction) => {
			const db: PooledBalanceDb = transaction;
			await pooledBalanceRepo.lockCustomer({ db, internalCustomerId });

			const sourceRemovalByCustomerProductId = new Map(
				customerOperations
					.filter(
						(operation): operation is RemovePooledBalanceSourceOp =>
							operation.op === "remove_source",
					)
					.map((operation) => [operation.sourceCustomerProductId, operation]),
			);
			const contributionRemovalBySourceKey = new Map(
				customerOperations
					.filter(
						(operation): operation is RemovePooledBalanceContributionOp =>
							operation.op === "remove_contribution",
					)
					.map((operation) => [
						`${operation.sourceCustomerProductId}:${operation.sourceEntitlementId}`,
						operation,
					]),
			);
			const contributions =
				await pooledBalanceRepo.listContributionsBySourceCustomerProductIds({
					db,
					sourceCustomerProductIds: [
						...new Set(
							customerOperations.map(
								(operation) => operation.sourceCustomerProductId,
							),
						),
					],
				});
			const pools = await pooledBalanceRepo.listByIds({
				db,
				pooledBalanceIds: [
					...new Set(
						contributions.map((contribution) => contribution.pooled_balance_id),
					),
				],
			});
			const poolById = new Map(pools.map((pool) => [pool.id, pool]));
			const adjustmentsByPoolId = new Map<
				string,
				{ pool: DbPooledBalance; delta: number }
			>();
			const now = Date.now();

			for (const contribution of contributions) {
				const operation =
					contributionRemovalBySourceKey.get(
						`${contribution.source_customer_product_id}:${contribution.source_entitlement_id}`,
					) ??
					sourceRemovalByCustomerProductId.get(
						contribution.source_customer_product_id,
					);
				const pool = poolById.get(contribution.pooled_balance_id);
				if (
					!operation ||
					!pool ||
					pool.internal_customer_id !== internalCustomerId
				) {
					throw new InternalError({
						message: `Pooled balance '${contribution.pooled_balance_id}' is missing or belongs to a different customer.`,
					});
				}

				const transition = computePooledContributionTransition({
					previous: {
						currentCycleContribution: contribution.current_contribution,
						nextCycleContribution: contribution.next_cycle_contribution,
					},
					desired: {
						currentCycleContribution:
							operation.effectiveAt === null
								? 0
								: contribution.current_contribution,
						nextCycleContribution: 0,
					},
				});

				await pooledBalanceRepo.updateContribution({
					db,
					contributionId: contribution.id,
					currentContribution: transition.next.currentCycleContribution,
					nextCycleContribution: transition.next.nextCycleContribution,
					effectiveAt: operation.effectiveAt,
					updatedAt: now,
				});
				const previousAdjustment = adjustmentsByPoolId.get(pool.id);
				adjustmentsByPoolId.set(pool.id, {
					pool,
					delta:
						(previousAdjustment?.delta ?? 0) + transition.contributionDelta,
				});
			}

			for (const { pool, delta } of adjustmentsByPoolId.values()) {
				await pooledBalanceRepo.incrementBalanceAndAdjustment({
					db,
					customerEntitlementId: pool.customer_entitlement_id,
					delta,
				});
			}
			return [...adjustmentsByPoolId.values()];
		});

		for (const { pool, delta } of cacheAdjustments) {
			if (delta === 0) continue;
			const cacheEffect = pooledBalanceToCacheEffect({
				ctx,
				pool,
				balanceDelta: delta,
				adjustmentDelta: delta,
			});
			cacheEffects.push(cacheEffect);
			affectedFeatureIds.add(cacheEffect.featureId);
		}
	}

	return { affectedFeatureIds: [...affectedFeatureIds], cacheEffects };
};

const applyPooledBalanceDeltasToFullSubject = ({
	fullSubject,
	deltas,
}: {
	fullSubject: FullSubject;
	deltas: PooledBalanceRebalanceDelta[];
}) => {
	const deltaByCustomerEntitlementId = new Map<string, Decimal>();
	for (const delta of deltas) {
		deltaByCustomerEntitlementId.set(
			delta.customerEntitlementId,
			(
				deltaByCustomerEntitlementId.get(delta.customerEntitlementId) ??
				new Decimal(0)
			).plus(delta.delta),
		);
	}

	const customerEntitlements = [
		...fullSubject.extra_customer_entitlements,
		...fullSubject.customer_products.flatMap(
			(customerProduct) => customerProduct.customer_entitlements,
		),
	];
	for (const customerEntitlement of customerEntitlements) {
		const delta = deltaByCustomerEntitlementId.get(customerEntitlement.id);
		if (!delta) continue;
		customerEntitlement.balance = new Decimal(customerEntitlement.balance ?? 0)
			.plus(delta)
			.toNumber();
	}
};

const executePooledBalanceRebalance = async ({
	ctx,
	customerId,
	internalCustomerId,
	featureIds,
	usageReapplies = [],
}: {
	ctx: AutumnContext;
	customerId: string;
	internalCustomerId: string;
	featureIds: string[];
	usageReapplies?: PooledBalanceUsageReapply[];
}) => {
	if (featureIds.length === 0) return null;

	const result = await ctx.db.transaction(async (transaction) => {
		const db: PooledBalanceDb = transaction;
		await pooledBalanceRepo.lockCustomer({
			db,
			internalCustomerId,
		});
		const inStatuses = orgToInStatuses({ org: ctx.org });
		const queryResult = await transaction.execute(
			getFullSubjectQuery({
				orgId: ctx.org.id,
				env: ctx.env,
				customerId,
				inStatuses,
			}),
		);
		const queryRows = (Array.isArray(queryResult)
			? queryResult
			: queryResult.rows) as unknown as SubjectQueryRow[];
		const row = queryRows[0];
		if (!row) {
			throw new InternalError({
				message: `Cannot load customer '${customerId}' for pooled balance rebalance.`,
			});
		}
		const fullSubject = resultToFullSubject({ row });
		if (fullSubject.internalCustomerId !== internalCustomerId) {
			throw new InternalError({
				message: `Pooled balance rebalance customer mismatch for '${customerId}'.`,
			});
		}
		const fullSubjectAfterUsageReapply = structuredClone(fullSubject);
		const usageReapplyDeltas = computePooledBalanceUsageReapply({
			fullSubject: fullSubjectAfterUsageReapply,
			usageReapplies,
			reverseOrder: ctx.org.config?.reverse_deduction_order,
			inStatuses,
		});
		applyPooledBalanceDeltasToFullSubject({
			fullSubject: fullSubjectAfterUsageReapply,
			deltas: usageReapplyDeltas,
		});
		const computedDeltas = computePooledBalanceRebalance({
			fullSubject: fullSubjectAfterUsageReapply,
			featureIds,
			reverseOrder: ctx.org.config?.reverse_deduction_order,
			inStatuses,
		});
		const deltasInLockOrder = [...usageReapplyDeltas, ...computedDeltas].sort(
			(first, second) =>
				first.customerEntitlementId.localeCompare(second.customerEntitlementId),
		);

		for (const delta of deltasInLockOrder) {
			await pooledBalanceRepo.incrementBalanceAndAdjustmentDeltas({
				db,
				customerEntitlementId: delta.customerEntitlementId,
				balanceDelta: delta.delta,
				adjustmentDelta: 0,
			});
		}

		return { usageReapplyDeltas, fullSubject, inStatuses };
	});

	return {
		fullSubject: result.fullSubject,
		inStatuses: result.inStatuses,
		usageReapplyDeltas: result.usageReapplyDeltas,
	};
};

const executePooledBalanceOwnerTransition = async ({
	ctx,
	operation,
}: {
	ctx: AutumnContext;
	operation: PooledBalanceOwnerTransitionOp;
}) => {
	const effectiveAt =
		operation.op === "stage_owner_removal"
			? operation.effectiveAt
			: operation.expectedEffectiveAt;
	if (!Number.isFinite(effectiveAt)) {
		throw new InternalError({
			message: `Pooled balance owner transition requires a finite effective boundary.`,
			data: { operation: operation.op, effectiveAt },
		});
	}

	await ctx.db.transaction(async (transaction) => {
		const db: PooledBalanceDb = transaction;
		await pooledBalanceRepo.lockCustomer({
			db,
			internalCustomerId: operation.internalCustomerId,
		});

		const contributions = await pooledBalanceRepo.listContributionsByOwner({
			db,
			internalCustomerId: operation.internalCustomerId,
			owner: { customerLicenseLinkId: operation.customerLicenseLinkId },
		});
		const now = Date.now();

		for (const contribution of contributions) {
			if (
				operation.op === "restore_owner" &&
				contribution.effective_at !== operation.expectedEffectiveAt
			) {
				continue;
			}

			await pooledBalanceRepo.updateContribution({
				db,
				contributionId: contribution.id,
				currentContribution: contribution.current_contribution,
				nextCycleContribution:
					operation.op === "stage_owner_removal"
						? 0
						: contribution.current_contribution,
				effectiveAt:
					operation.op === "stage_owner_removal" ? operation.effectiveAt : null,
				updatedAt: now,
			});
		}
	});
};

const executeRestorePooledBalanceSource = async ({
	ctx,
	operation,
}: {
	ctx: AutumnContext;
	operation: RestorePooledBalanceSourceOp;
}) => {
	if (!Number.isFinite(operation.expectedEffectiveAt)) {
		throw new InternalError({
			message: `Pooled balance source restore requires a finite effective boundary.`,
			data: { expectedEffectiveAt: operation.expectedEffectiveAt },
		});
	}

	await ctx.db.transaction(async (transaction) => {
		const db: PooledBalanceDb = transaction;
		await pooledBalanceRepo.lockCustomer({
			db,
			internalCustomerId: operation.internalCustomerId,
		});
		const contributions =
			await pooledBalanceRepo.listContributionsBySourceCustomerProductIds({
				db,
				sourceCustomerProductIds: [operation.sourceCustomerProductId],
			});
		const now = Date.now();

		for (const contribution of contributions) {
			if (contribution.effective_at !== operation.expectedEffectiveAt) continue;

			await pooledBalanceRepo.updateContribution({
				db,
				contributionId: contribution.id,
				currentContribution: contribution.current_contribution,
				nextCycleContribution: contribution.current_contribution,
				effectiveAt: null,
				updatedAt: now,
			});
		}
	});
};

const executePooledBalanceOpsWithLock = async ({
	ctx,
	customerId,
	pooledBalanceOps,
	beforeDatabaseOperations,
	beforeRebalance,
	afterRebalance,
}: {
	ctx: AutumnContext;
	customerId: string;
	pooledBalanceOps: AutumnBillingPlan["pooledBalanceOps"];
	beforeDatabaseOperations?: PooledBalanceTransactionCallback;
	beforeRebalance?: PooledBalanceTransactionCallback;
	afterRebalance?: PooledBalanceTransactionCallback;
}) => {
	const operations = pooledBalanceOps ?? [];
	if (operations.length === 0) {
		await beforeDatabaseOperations?.({ db: ctx.db });
		await beforeRebalance?.({ db: ctx.db });
		await afterRebalance?.({ db: ctx.db });
		return;
	}
	const expectedSubjectViewEpoch = await getOrInitFullSubjectViewEpoch({
		ctx,
		customerId,
	});

	const internalCustomerId = operations[0].internalCustomerId;
	if (
		operations.some(
			(operation) => operation.internalCustomerId !== internalCustomerId,
		)
	) {
		throw new InternalError({
			message: `Pooled balance operations for customer '${customerId}' contain multiple internal customer IDs.`,
		});
	}

	const affectedFeatureIds = new Set<string>();
	const cacheEffects: PooledBalanceCacheEffect[] = [];
	const usageReapplies: PooledBalanceUsageReapply[] = [];
	await beforeDatabaseOperations?.({ db: ctx.db });
	let operationIndex = 0;
	while (operationIndex < operations.length) {
		const operation = operations[operationIndex];
		switch (operation.op) {
			case "upsert_source": {
				const result = await executeUpsertPooledBalanceSource({
					ctx,
					customerId,
					operation,
				});
				for (const featureId of result.affectedFeatureIds) {
					affectedFeatureIds.add(featureId);
				}
				cacheEffects.push(...result.cacheEffects);
				usageReapplies.push(...result.usageReapplies);
				operationIndex += 1;
				continue;
			}
			case "stage_owner_removal":
			case "restore_owner":
				await executePooledBalanceOwnerTransition({ ctx, operation });
				operationIndex += 1;
				continue;
			case "restore_source":
				await executeRestorePooledBalanceSource({ ctx, operation });
				operationIndex += 1;
				continue;
			case "transfer_source": {
				const adjustments = await executePooledBalanceTransferDatabaseUpdates({
					ctx,
					customerId,
					internalCustomerId: operation.internalCustomerId,
					operations: [operation],
				});
				for (const { pool, delta, adjustmentDelta } of adjustments) {
					if (delta === 0 && adjustmentDelta === 0) continue;
					const cacheEffect = pooledBalanceToCacheEffect({
						ctx,
						pool,
						balanceDelta: delta,
						adjustmentDelta,
					});
					cacheEffects.push(cacheEffect);
					affectedFeatureIds.add(cacheEffect.featureId);
				}
				operationIndex += 1;
				continue;
			}
			case "remove_source":
			case "remove_contribution":
				break;
		}

		const removalOperations: PooledBalanceRemovalOp[] = [];
		while (operationIndex < operations.length) {
			const removalOperation = operations[operationIndex];
			if (
				removalOperation.op !== "remove_source" &&
				removalOperation.op !== "remove_contribution"
			) {
				break;
			}
			removalOperations.push(removalOperation);
			operationIndex += 1;
		}
		const removalResult = await executeRemovePooledBalanceSources({
			ctx,
			operations: removalOperations,
		});
		for (const featureId of removalResult.affectedFeatureIds) {
			affectedFeatureIds.add(featureId);
		}
		cacheEffects.push(...removalResult.cacheEffects);
	}

	await beforeRebalance?.({ db: ctx.db });
	if (affectedFeatureIds.size === 0) {
		await afterRebalance?.({ db: ctx.db });
		return;
	}
	const rebalanceResult = await executePooledBalanceRebalance({
		ctx,
		customerId,
		internalCustomerId,
		featureIds: [...affectedFeatureIds],
		usageReapplies,
	});
	await afterRebalance?.({ db: ctx.db });
	if (!rebalanceResult) return;
	cacheEffects.push(
		...rebalanceResult.usageReapplyDeltas.map(
			({ customerEntitlementId, featureId, delta }) => ({
				customerEntitlementId,
				featureId,
				balanceDelta: delta,
				adjustmentDelta: 0,
			}),
		),
	);
	return {
		customerId,
		fullSubject: rebalanceResult.fullSubject,
		featureIds: [...affectedFeatureIds],
		rawEffects: cacheEffects,
		expectedSubjectViewEpoch,
		reverseOrder: ctx.org.config?.reverse_deduction_order,
		inStatuses: rebalanceResult.inStatuses,
	} satisfies PreparedPooledBalanceCacheCutover;
};

export type ExecutePooledBalanceOpsDependencies = {
	withCustomerBalanceSyncLock: typeof withCustomerBalanceSyncLock;
	executeWithLock: typeof executePooledBalanceOpsWithLock;
	applyCacheCutover: typeof applyPreparedPooledBalanceCacheCutover;
};

export const executePooledBalanceOpsWithDependencies = async ({
	ctx,
	customerId,
	pooledBalancePlan,
	pooledBalanceOps,
	balanceSyncDb,
	beforeDatabaseOperations,
	beforeRebalance,
	afterRebalance,
	dependencies = {
		withCustomerBalanceSyncLock,
		executeWithLock: executePooledBalanceOpsWithLock,
		applyCacheCutover: applyPreparedPooledBalanceCacheCutover,
	},
}: {
	ctx: AutumnContext;
	customerId: string;
	pooledBalancePlan?: PooledBalancePlan;
	pooledBalanceOps?: AutumnBillingPlan["pooledBalanceOps"];
	/** Existing customer balance-sync transaction. */
	balanceSyncDb?: CustomerBalanceSyncDb;
	beforeDatabaseOperations?: PooledBalanceTransactionCallback;
	beforeRebalance?: PooledBalanceTransactionCallback;
	afterRebalance?: PooledBalanceTransactionCallback;
	dependencies?: ExecutePooledBalanceOpsDependencies;
}) => {
	const operations = [
		...pooledBalancePlanToOps({ pooledBalancePlan }),
		...(pooledBalanceOps ?? []),
	];
	if (
		operations.length === 0 &&
		!beforeDatabaseOperations &&
		!beforeRebalance &&
		!afterRebalance
	)
		return;

	const executeWithLock = ({ db }: { db: CustomerBalanceSyncDb }) =>
		dependencies.executeWithLock({
			ctx: { ...ctx, db },
			customerId,
			pooledBalanceOps: operations,
			beforeDatabaseOperations,
			beforeRebalance,
			afterRebalance,
		});
	if (balanceSyncDb) {
		return executeWithLock({ db: balanceSyncDb });
	}

	const prepared = await dependencies.withCustomerBalanceSyncLock({
		ctx,
		customerId,
		internalCustomerId: operations[0]?.internalCustomerId,
		callback: executeWithLock,
	});
	if (!prepared) return;
	await dependencies.applyCacheCutover({ ctx, prepared });
};

export const executePooledBalanceOps = async ({
	ctx,
	customerId,
	pooledBalancePlan,
	pooledBalanceOps,
	balanceSyncDb,
	beforeDatabaseOperations,
	beforeRebalance,
	afterRebalance,
}: {
	ctx: AutumnContext;
	customerId: string;
	pooledBalancePlan?: PooledBalancePlan;
	pooledBalanceOps?: AutumnBillingPlan["pooledBalanceOps"];
	/** Existing customer balance-sync transaction. */
	balanceSyncDb?: CustomerBalanceSyncDb;
	beforeDatabaseOperations?: PooledBalanceTransactionCallback;
	beforeRebalance?: PooledBalanceTransactionCallback;
	afterRebalance?: PooledBalanceTransactionCallback;
}) =>
	executePooledBalanceOpsWithDependencies({
		ctx,
		customerId,
		pooledBalancePlan,
		pooledBalanceOps,
		balanceSyncDb,
		beforeDatabaseOperations,
		beforeRebalance,
		afterRebalance,
	});
