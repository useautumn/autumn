import type {
	CusProductStatus,
	FullSubject,
	SubjectBalance,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { writeSubjectBalancesToDb } from "@/internal/balances/utils/sync/flushSubjectBalancesToDb.js";
import { computePooledBalanceCacheCutover } from "@/internal/billing/v2/pooledBalances/compute/computePooledBalanceCacheCutover.js";
import { getPooledRebalanceCustomerEntitlements } from "@/internal/billing/v2/pooledBalances/compute/computePooledBalanceRebalance.js";
import { computePooledBalanceReconciliation } from "@/internal/billing/v2/pooledBalances/compute/computePooledBalanceReconciliation.js";
import type { PooledBalanceCacheEffect } from "@/internal/billing/v2/pooledBalances/compute/pooledBalanceCacheEffects.js";
import { pooledBalanceRepo } from "@/internal/billing/v2/pooledBalances/repos/pooledBalanceRepo.js";
import { isPooledSourceCustomerEntitlement } from "@/internal/billing/v2/pooledBalances/utils/pooledCustomerEntitlementClassification.js";
import { getOrInitFullSubjectViewEpoch } from "@/internal/customers/cache/fullSubject/actions/invalidate/getOrInitFullSubjectViewEpoch.js";
import { captureAndDeleteSharedBalanceFields } from "@/internal/customers/cache/fullSubject/actions/invalidate/invalidateSharedBalanceFields.js";
import { getCachedFeatureBalance } from "@/internal/customers/cache/fullSubject/balances/getCachedFeatureBalances.js";
import { buildFullSubjectViewEpochKey } from "@/internal/customers/cache/fullSubject/builders/buildFullSubjectViewEpochKey.js";
import { buildSharedFullSubjectBalanceKey } from "@/internal/customers/cache/fullSubject/builders/buildSharedFullSubjectBalanceKey.js";
import { FULL_SUBJECT_CACHE_TTL_SECONDS } from "@/internal/customers/cache/fullSubject/config/fullSubjectCacheConfig.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import {
	deleteCachedFullCustomer,
	deleteLegacyCachedFullCustomer,
} from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";

type CacheBatchResult = {
	conflict?: boolean;
	cache_miss?: boolean;
	epoch_mismatch?: boolean;
	missing?: string[];
	mismatched?: string[];
	invalid?: string[];
};

type AtomicApplyResult =
	| { kind: "applied" }
	| { kind: "epoch_mismatch" }
	| { kind: "conflict"; detail: CacheBatchResult }
	| { kind: "missing"; reason: string };

const MAX_CUTOVER_ATTEMPTS = 3;

const invalidatePooledBalanceCaches = async ({
	ctx,
	customerId,
	reason,
}: {
	ctx: AutumnContext;
	customerId: string;
	reason: string;
}) => {
	ctx.logger.warn(
		`[applyPooledBalanceCacheEffects] invalidating customer cache: ${reason}`,
	);
	await deleteCachedFullCustomer({
		ctx,
		customerId,
		source: `applyPooledBalanceCacheEffects:${reason}`,
		flushBalances: false,
	});
};

const flushBalances = async ({
	ctx,
	balances,
}: {
	ctx: AutumnContext;
	balances: SubjectBalance[];
}) => {
	if (balances.length === 0) return;
	await writeSubjectBalancesToDb({
		db: ctx.db,
		subjectBalances: balances,
		queryName: "applyPooledBalanceCacheEffects",
	});
};

export const partitionSubjectBalancesByCacheVersion = ({
	subjectBalances,
	currentCustomerEntitlements,
}: {
	subjectBalances: SubjectBalance[];
	currentCustomerEntitlements: Array<{
		id: string;
		cache_version?: number | null;
	}>;
}) => {
	const currentCacheVersionById = new Map(
		currentCustomerEntitlements.map((customerEntitlement) => [
			customerEntitlement.id,
			customerEntitlement.cache_version ?? 0,
		]),
	);
	const syncable: SubjectBalance[] = [];
	const stale: SubjectBalance[] = [];

	for (const subjectBalance of subjectBalances) {
		const currentCacheVersion = currentCacheVersionById.get(subjectBalance.id);
		if (
			currentCacheVersion === undefined ||
			currentCacheVersion !== (subjectBalance.cache_version ?? 0)
		) {
			stale.push(subjectBalance);
			continue;
		}
		syncable.push(subjectBalance);
	}

	return { stale, syncable };
};

export const partitionCapturedBalancesForPooledReconciliation = ({
	subjectBalances,
	currentCustomerEntitlements,
	pooledSourceCustomerEntitlementIds,
}: {
	subjectBalances: SubjectBalance[];
	currentCustomerEntitlements: Array<{
		id: string;
		cache_version?: number | null;
	}>;
	pooledSourceCustomerEntitlementIds: ReadonlySet<string>;
}) => {
	const { syncable, stale } = partitionSubjectBalancesByCacheVersion({
		subjectBalances,
		currentCustomerEntitlements,
	});
	return {
		liveBalances: syncable,
		balancesToFlush: syncable.filter(
			(subjectBalance) =>
				!pooledSourceCustomerEntitlementIds.has(subjectBalance.id),
		),
		stale,
	};
};

const partitionCurrentSubjectBalances = async ({
	ctx,
	subjectBalances,
}: {
	ctx: AutumnContext;
	subjectBalances: SubjectBalance[];
}) => {
	const currentCustomerEntitlements = await CusEntService.getByIds({
		db: ctx.db,
		ids: subjectBalances.map((subjectBalance) => subjectBalance.id),
	});
	return partitionSubjectBalancesByCacheVersion({
		subjectBalances,
		currentCustomerEntitlements,
	});
};

const getPooledSourceCustomerEntitlementIds = ({
	fullSubject,
}: {
	fullSubject: FullSubject;
}) =>
	new Set(
		fullSubject.customer_products.flatMap((customerProduct) =>
			customerProduct.customer_entitlements
				.filter((customerEntitlement) =>
					isPooledSourceCustomerEntitlement({
						customerEntitlement,
						customerProduct,
					}),
				)
				.map((customerEntitlement) => customerEntitlement.id),
		),
	);

const flushCapturedCurrentBalancesAndInvalidate = async ({
	ctx,
	customerId,
	fullSubject,
	reason,
}: {
	ctx: AutumnContext;
	customerId: string;
	fullSubject: FullSubject;
	reason: string;
}) => {
	const captured = await captureAndDeleteSharedBalanceFields({
		ctx,
		customerId,
		failureMode: "strict",
	});
	if (captured) {
		const pooledSourceCustomerEntitlementIds =
			getPooledSourceCustomerEntitlementIds({ fullSubject });
		const { syncable } = await partitionCurrentSubjectBalances({
			ctx,
			subjectBalances: captured.subjectBalances.filter(
				(subjectBalance) =>
					!pooledSourceCustomerEntitlementIds.has(subjectBalance.id),
			),
		});
		await writeSubjectBalancesToDb({
			db: ctx.db,
			subjectBalances: syncable,
			usageWindowUpdates: captured.usageWindowUpdates,
			queryName: "flushCurrentPooledBalanceCutover",
		});
	}

	await invalidatePooledBalanceCaches({ ctx, customerId, reason });
};

const applyFullSubjectEffects = async ({
	ctx,
	customerId,
	featureIds,
	effectsByFeatureId,
	expectedSubjectViewEpoch,
}: {
	ctx: AutumnContext;
	customerId: string;
	featureIds: string[];
	effectsByFeatureId: ReadonlyMap<string, PooledBalanceCacheEffect[]>;
	expectedSubjectViewEpoch: number;
}): Promise<AtomicApplyResult> => {
	const epochKey = buildFullSubjectViewEpochKey({
		orgId: ctx.org.id,
		env: ctx.env,
		customerId,
	});
	const balanceKeys = featureIds.map((featureId) =>
		buildSharedFullSubjectBalanceKey({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId,
			featureId,
		}),
	);
	const resultJson = await tryRedisWrite(
		() =>
			ctx.redisV2.updateSubjectBalanceBatches(
				balanceKeys.length + 1,
				epochKey,
				...balanceKeys,
				JSON.stringify({
					expected_subject_view_epoch: expectedSubjectViewEpoch,
					ttl_seconds: FULL_SUBJECT_CACHE_TTL_SECONDS,
					batches: featureIds.map((featureId) => ({
						updates: (effectsByFeatureId.get(featureId) ?? []).map(
							(effect) => ({
								cus_ent_id: effect.customerEntitlementId,
								balance_delta: effect.balanceDelta,
								adjustment_delta: effect.adjustmentDelta,
								expected_balance: effect.expectedBalance ?? null,
								expected_adjustment: effect.expectedAdjustment ?? null,
							}),
						),
					})),
				}),
			),
		ctx.redisV2,
	);
	if (resultJson === null) {
		return { kind: "missing", reason: "write_failed" };
	}

	let result: CacheBatchResult;
	try {
		result = JSON.parse(resultJson) as CacheBatchResult;
	} catch {
		return { kind: "missing", reason: "invalid_write_result" };
	}
	if (result.cache_miss) {
		return { kind: "missing", reason: "hash_missing" };
	}
	if (result.epoch_mismatch) return { kind: "epoch_mismatch" };
	if (result.conflict) return { kind: "conflict", detail: result };
	return { kind: "applied" };
};

const reconcileCapturedBalances = async ({
	ctx,
	customerId,
	fullSubject,
	featureIds,
	reverseOrder,
	inStatuses,
	reason,
}: {
	ctx: AutumnContext;
	customerId: string;
	fullSubject: FullSubject;
	featureIds: string[];
	reverseOrder?: boolean;
	inStatuses?: CusProductStatus[];
	reason: string;
}) => {
	ctx.logger.warn(
		`[applyPooledBalanceCacheEffects] reconciling captured balances: ${reason}`,
	);
	const captured = await captureAndDeleteSharedBalanceFields({
		ctx,
		customerId,
		failureMode: "strict",
	});

	if (captured) {
		const pooledSourceCustomerEntitlementIds =
			getPooledSourceCustomerEntitlementIds({ fullSubject });
		const currentCustomerEntitlements = await CusEntService.getByIds({
			db: ctx.db,
			ids: captured.subjectBalances.map((subjectBalance) => subjectBalance.id),
		});
		const { liveBalances, balancesToFlush } =
			partitionCapturedBalancesForPooledReconciliation({
				subjectBalances: captured.subjectBalances,
				currentCustomerEntitlements,
				pooledSourceCustomerEntitlementIds,
			});
		await writeSubjectBalancesToDb({
			db: ctx.db,
			subjectBalances: balancesToFlush,
			usageWindowUpdates: captured.usageWindowUpdates,
			queryName: "reconcileCapturedPooledBalances",
		});

		const internalFeatureIds = ctx.features
			.filter((feature) => featureIds.includes(feature.id))
			.map((feature) => feature.internal_id);
		const pools = await pooledBalanceRepo.listByInternalCustomerAndFeatureIds({
			db: ctx.db,
			internalCustomerId: fullSubject.internalCustomerId,
			internalFeatureIds,
		});
		const contributions = await pooledBalanceRepo.listContributionsByPoolIds({
			db: ctx.db,
			pooledBalanceIds: pools.map((pool) => pool.id),
		});
		const contributionTotalByPoolId = new Map<string, Decimal>();
		for (const contribution of contributions) {
			contributionTotalByPoolId.set(
				contribution.pooled_balance_id,
				(
					contributionTotalByPoolId.get(contribution.pooled_balance_id) ??
					new Decimal(0)
				).plus(contribution.current_contribution),
			);
		}
		const pooledGrantByCustomerEntitlementId = new Map(
			pools.map((pool) => [
				pool.customer_entitlement_id,
				(contributionTotalByPoolId.get(pool.id) ?? new Decimal(0)).toNumber(),
			]),
		);
		const updates = computePooledBalanceReconciliation({
			fullSubject,
			featureIds,
			pooledGrantByCustomerEntitlementId,
			liveBalances,
			reverseOrder,
			inStatuses,
		}).sort((first, second) =>
			first.customerEntitlementId.localeCompare(second.customerEntitlementId),
		);
		for (const update of updates) {
			await pooledBalanceRepo.setBalanceAndAdjustment({
				db: ctx.db,
				customerEntitlementId: update.customerEntitlementId,
				balance: update.balance,
				adjustment: update.adjustment,
			});
		}
	}

	await invalidatePooledBalanceCaches({ ctx, customerId, reason });
};

export const applyPooledBalanceCacheCutover = async ({
	ctx,
	customerId,
	fullSubject,
	featureIds,
	rawEffects,
	expectedSubjectViewEpoch,
	reverseOrder,
	inStatuses,
}: {
	ctx: AutumnContext;
	customerId: string;
	fullSubject: FullSubject;
	featureIds: string[];
	rawEffects: PooledBalanceCacheEffect[];
	expectedSubjectViewEpoch: number;
	reverseOrder?: boolean;
	inStatuses?: CusProductStatus[];
}): Promise<void> => {
	const uniqueFeatureIds = [...new Set(featureIds)];
	const customerEntitlementIdsByFeatureId = new Map(
		uniqueFeatureIds.map((featureId) => [
			featureId,
			[
				...new Set([
					...getPooledRebalanceCustomerEntitlements({
						fullSubject,
						featureId,
						reverseOrder,
						inStatuses,
					}).map(({ id }) => id),
					...rawEffects
						.filter((effect) => effect.featureId === featureId)
						.map((effect) => effect.customerEntitlementId),
				]),
			],
		]),
	);
	let expectedEpoch = expectedSubjectViewEpoch;
	let failureReason = "cutover_conflict_exhausted";

	for (let attempt = 0; attempt < MAX_CUTOVER_ATTEMPTS; attempt += 1) {
		const liveBalancesByFeatureId = new Map<string, SubjectBalance[]>();
		let readFailed = false;
		for (const featureId of uniqueFeatureIds) {
			const customerEntitlementIds =
				customerEntitlementIdsByFeatureId.get(featureId) ?? [];
			const liveBalanceOutcome = await getCachedFeatureBalance({
				ctx,
				customerId,
				featureId,
				customerEntitlementIds,
				readMaster: true,
			});
			if (liveBalanceOutcome.kind !== "ok") {
				failureReason = `cutover_read:${liveBalanceOutcome.reason}`;
				readFailed = true;
				break;
			}
			liveBalancesByFeatureId.set(featureId, liveBalanceOutcome.value.balances);
		}
		if (readFailed) break;

		const effectsByFeatureId = new Map(
			uniqueFeatureIds.map((featureId) => [
				featureId,
				computePooledBalanceCacheCutover({
					fullSubject,
					featureIds: [featureId],
					rawEffects: rawEffects.filter(
						(effect) => effect.featureId === featureId,
					),
					liveBalances: liveBalancesByFeatureId.get(featureId) ?? [],
					reverseOrder,
					inStatuses,
				}),
			]),
		);
		const result = await applyFullSubjectEffects({
			ctx,
			customerId,
			featureIds: uniqueFeatureIds,
			effectsByFeatureId,
			expectedSubjectViewEpoch: expectedEpoch,
		});
		if (result.kind === "epoch_mismatch") {
			failureReason = "cutover_epoch_mismatch";
			expectedEpoch = await getOrInitFullSubjectViewEpoch({ ctx, customerId });
			continue;
		}
		if (result.kind === "conflict") {
			failureReason = `cutover_conflict:${JSON.stringify(result.detail)}`;
			continue;
		}
		if (result.kind === "missing") {
			failureReason = result.reason;
			break;
		}

		const balancesToFlush: SubjectBalance[] = [];
		let finalReadFailed = false;
		for (const featureId of uniqueFeatureIds) {
			const customerEntitlementIds =
				customerEntitlementIdsByFeatureId.get(featureId) ?? [];
			const finalBalanceOutcome = await getCachedFeatureBalance({
				ctx,
				customerId,
				featureId,
				customerEntitlementIds,
				readMaster: true,
			});
			if (finalBalanceOutcome.kind !== "ok") {
				failureReason = `cutover_final_read:${finalBalanceOutcome.reason}`;
				finalReadFailed = true;
				break;
			}

			balancesToFlush.push(...finalBalanceOutcome.value.balances);
		}
		if (finalReadFailed) break;

		const { stale } = await partitionCurrentSubjectBalances({
			ctx,
			subjectBalances: balancesToFlush,
		});
		if (stale.length > 0) {
			failureReason = `cutover_cache_version_mismatch:${stale
				.map((subjectBalance) => subjectBalance.id)
				.join(",")}`;
			await flushCapturedCurrentBalancesAndInvalidate({
				ctx,
				customerId,
				fullSubject,
				reason: failureReason,
			});
			return;
		}
		await flushBalances({ ctx, balances: balancesToFlush });
		await deleteLegacyCachedFullCustomer({
			ctx,
			customerId,
			source: "applyPooledBalanceCacheCutover",
		});
		return;
	}

	await reconcileCapturedBalances({
		ctx,
		customerId,
		fullSubject,
		featureIds: uniqueFeatureIds,
		reverseOrder,
		inStatuses,
		reason: failureReason,
	});
};
