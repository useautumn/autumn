import {
	CusProductStatus,
	type FullCustomer,
	fullCustomerToCustomerEntitlements,
} from "@autumn/shared";
import * as Sentry from "@sentry/bun";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	type ResetCusEntParam,
	resetCusEnts,
} from "@/internal/balances/utils/sql/client.js";
import {
	type PooledCustomerEntitlementReset,
	resetPooledCustomerEntitlements,
} from "@/internal/billing/v2/pooledBalances/reset/resetPooledCustomerEntitlements.js";
import { resetSubjectCache } from "../resetCustomerEntitlementsV2/resetSubjectCache.js";
import { applyResetResults } from "./applyResetResults.js";
import { executeResetCache } from "./executeResetCache.js";
import { getCusEntsNeedingReset } from "./getCusEntsNeedingReset.js";
import { type ProcessResetResult, processReset } from "./processReset.js";

/** Maps a processReset result into the JSONB shape for the SQL function. */
const toResetParam = ({
	cusEntId,
	result,
}: {
	cusEntId: string;
	result: ProcessResetResult;
}): ResetCusEntParam => {
	const { updates } = result;
	const firstRollover = result.rolloverInsert?.rows[0] ?? null;

	return {
		cus_ent_id: cusEntId,
		balance: updates.balance,
		additional_balance: updates.additional_balance,
		adjustment: updates.adjustment,
		entities: updates.entities,
		next_reset_at: updates.next_reset_at,
		rollover_insert: firstRollover,
	};
};

const pooledResetToProcessResetResult = ({
	pooledReset,
}: {
	pooledReset: PooledCustomerEntitlementReset;
}): ProcessResetResult => {
	return {
		updates: {
			balance: pooledReset.balance,
			additional_balance: 0,
			adjustment: pooledReset.adjustment,
			entities: null,
			next_reset_at: pooledReset.nextResetAt,
		},
		...(pooledReset.rolloverInsert
			? { rolloverInsert: pooledReset.rolloverInsert }
			: {}),
	};
};

/**
 * Lazily resets customer entitlements that have passed their next_reset_at.
 * Uses an atomic Postgres function with per-row locking to prevent double-resets.
 * Mutates the FullCustomer in-memory using the latest DB state from applied resets.
 * Returns true if any entitlements were reset.
 */
export const resetCustomerEntitlements = async ({
	ctx,
	fullCus,
	now = Date.now(),
}: {
	ctx: AutumnContext;
	fullCus: FullCustomer;
	now?: number;
}): Promise<boolean> => {
	const { logger } = ctx;
	const customerId = fullCus.id || fullCus.internal_id;

	try {
		const allCustomerEntitlements = fullCustomerToCustomerEntitlements({
			fullCustomer: fullCus,
			inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
		});
		const pooledResets = await resetPooledCustomerEntitlements({
			ctx,
			customerId,
			customerEntitlements: allCustomerEntitlements,
			now,
		});
		const cusEntsNeedingReset = getCusEntsNeedingReset({ fullCus, now });
		if (cusEntsNeedingReset.length === 0 && pooledResets.length === 0) {
			return false;
		}

		logger.info(
			`[resetCustomerEntitlements] customer=${customerId}, cusEnts needing reset: ${cusEntsNeedingReset.length + pooledResets.length}`,
		);

		// 1. Compute all resets (pure computation, no DB writes)
		const computed: Array<{
			cusEntId: string;
			result: ProcessResetResult;
		}> = [];

		for (const cusEnt of cusEntsNeedingReset) {
			const result = await processReset({ cusEnt, ctx });
			if (!result) continue;
			computed.push({ cusEntId: cusEnt.id, result });
		}

		// 2. Execute atomic DB writes via Postgres function
		const standardResets = computed.map(({ cusEntId, result }) =>
			toResetParam({ cusEntId, result }),
		);
		const { applied, skipped } =
			standardResets.length > 0
				? await resetCusEnts({ ctx, resets: standardResets })
				: { applied: {}, skipped: [] };
		const pooledComputed = pooledResets.map((pooledReset) => ({
			cusEntId: pooledReset.customerEntitlementId,
			result: pooledResetToProcessResetResult({ pooledReset }),
		}));
		const allComputed = [...computed, ...pooledComputed];
		if (allComputed.length === 0) return false;
		const allSkipped = [
			...skipped,
			...pooledResets
				.filter((pooledReset) => !pooledReset.applied)
				.map((pooledReset) => pooledReset.customerEntitlementId),
		];
		const resets = allComputed.map(({ cusEntId, result }) =>
			toResetParam({ cusEntId, result }),
		);

		logger.info(
			`[resetCustomerEntitlements] customer=${customerId}, applied: ${Object.keys(applied).length + pooledResets.filter((pooledReset) => pooledReset.applied).length}, skipped: ${allSkipped.length}`,
		);

		// 3. Apply computed reset values to in-memory FullCustomer.
		// Both DB-applied and DB-skipped cusEnts get their in-memory state updated
		// (skipped means another request already wrote the same values to DB).
		// Rollover clearing only runs for DB-applied entries.
		const clearingMap = await applyResetResults({
			ctx,
			fullCus,
			computed: allComputed,
			skipped: allSkipped,
		});

		// 4. Update Redis cache atomically (fire-and-forget)
		// Only needed when we actually wrote to DB — skipped means cache was
		// already updated by the winning request.
		if (
			Object.keys(applied).length > 0 ||
			pooledResets.some((pooledReset) => pooledReset.applied)
		) {
			const oldNextResetAts: Record<string, number> = {};
			const customerEntitlementFeatureIds: Record<string, string> = {};
			for (const cusEnt of cusEntsNeedingReset) {
				if (cusEnt.next_reset_at) {
					oldNextResetAts[cusEnt.id] = cusEnt.next_reset_at;
				}
				customerEntitlementFeatureIds[cusEnt.id] = cusEnt.feature_id;
			}
			for (const pooledReset of pooledResets) {
				oldNextResetAts[pooledReset.customerEntitlementId] =
					pooledReset.resetAt;
				customerEntitlementFeatureIds[pooledReset.customerEntitlementId] =
					pooledReset.featureId;
			}

			await executeResetCache({
				ctx,
				customerId,
				resets,
				oldNextResetAts,
				clearingMap,
			});

			await resetSubjectCache({
				ctx,
				customerId,
				resets,
				oldNextResetAts,
				clearingMap,
				customerEntitlementFeatureIds,
			});

			logger.info(
				`[resetCustomerEntitlements] customer=${customerId}, Redis cache updated`,
			);
		}

		return true;
	} catch (error) {
		logger.error(
			`[resetCustomerEntitlements] customer=${customerId}, failed: ${error}`,
		);
		Sentry.captureException(error);
		return false;
	}
};
