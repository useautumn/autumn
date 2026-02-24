import type { FullCustomer } from "@autumn/shared";
import * as Sentry from "@sentry/bun";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	type ResetCusEntParam,
	resetCusEnts,
} from "@/internal/balances/utils/sql/client.js";
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

/**
 * Lazily resets customer entitlements that have passed their next_reset_at.
 * Uses an atomic Postgres function with per-row locking to prevent double-resets.
 * Mutates the FullCustomer in-memory using the latest DB state from applied resets.
 * Returns true if any entitlements were reset.
 */
export const resetCustomerEntitlements = async ({
	ctx,
	fullCus,
}: {
	ctx: AutumnContext;
	fullCus: FullCustomer;
}): Promise<boolean> => {
	const now = Date.now();

	const { logger } = ctx;
	const customerId = fullCus.id || fullCus.internal_id;

	const cusEntsNeedingReset = getCusEntsNeedingReset({ fullCus, now });

	// cusEntsNeedingReset = [];

	if (cusEntsNeedingReset.length === 0) return false;

	try {
		logger.info(
			`[resetCustomerEntitlements] customer=${customerId}, cusEnts needing reset: ${cusEntsNeedingReset.length}`,
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

		if (computed.length === 0) return false;

		// 2. Execute atomic DB writes via Postgres function
		const resets = computed.map(({ cusEntId, result }) =>
			toResetParam({ cusEntId, result }),
		);

		const { applied, skipped } = await resetCusEnts({ ctx, resets });

		logger.info(
			`[resetCustomerEntitlements] customer=${customerId}, applied: ${Object.keys(applied).length}, skipped: ${skipped.length}`,
		);

		// 3. Apply computed reset values to in-memory FullCustomer.
		// Both DB-applied and DB-skipped cusEnts get their in-memory state updated
		// (skipped means another request already wrote the same values to DB).
		// Rollover clearing only runs for DB-applied entries.
		await applyResetResults({ ctx, fullCus, computed, skipped });

		// 4. Update Redis cache atomically (fire-and-forget)
		// Only needed when we actually wrote to DB — skipped means cache was
		// already updated by the winning request.
		if (Object.keys(applied).length > 0) {
			// Build map of cusEntId -> old next_reset_at for the optimistic guard
			const oldNextResetAts: Record<string, number> = {};
			for (const cusEnt of cusEntsNeedingReset) {
				if (cusEnt.next_reset_at) {
					oldNextResetAts[cusEnt.id] = cusEnt.next_reset_at;
				}
			}

			await executeResetCache({
				ctx,
				customerId,
				resets,
				oldNextResetAts,
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
