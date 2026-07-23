import type { AppEnv } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { claimSyncDirty, clearSyncClaim } from "./dirtyState/claimSyncDirty.js";
import { syncItemV4 } from "./syncItemV4.js";

/** How long a signal waits before draining, so concurrent writes coalesce. */
const COALESCE_WINDOW_MS = 3_000;

export interface SyncCustomerDirtyPayload {
	customerId: string;
	orgId: string;
	env: AppEnv;
	region?: string;
	timestamp: number;
}

/**
 * Drains a customer's coalesced sync state (SyncCustomerDirty signal).
 *
 * Claims the dirty state (atomic move to a claim key), flushes the latest
 * Redis balances for the claimed selectors via the V4 flush, then clears the
 * claim. Ordering guarantees:
 *  - writes landing after the claim recreate the dirty key and re-signal —
 *    nothing written after our read is lost;
 *  - a crash before clearSyncClaim leaves the claim for the next delivery
 *    (message stays in SQS: transient errors rethrow and are retryable);
 *  - an empty claim (already drained / Redis loss) is a safe no-op.
 */
export const syncItemV5 = async ({
	ctx,
	payload,
}: {
	ctx: AutumnContext;
	payload: SyncCustomerDirtyPayload;
}): Promise<void> => {
	const scope = {
		orgId: payload.orgId,
		env: payload.env,
		customerId: payload.customerId,
	};
	const redis = ctx.redisV2;

	// Coalescing window: FIFO queues don't support per-message DelaySeconds,
	// so the window is enforced here — writes landing between the signal and
	// this claim merge into the same drain. Must stay well under the worker's
	// 25s message timeout.
	const windowRemainingMs =
		payload.timestamp + COALESCE_WINDOW_MS - Date.now();
	if (windowRemainingMs > 0) {
		await new Promise((resolve) =>
			setTimeout(resolve, Math.min(windowRemainingMs, COALESCE_WINDOW_MS)),
		);
	}

	const claimed = await claimSyncDirty({ redis, scope });
	if (!claimed) {
		ctx.logger.debug(
			`[SYNC V5] (${payload.customerId}) Nothing to drain (empty dirty state)`,
		);
		return;
	}

	await syncItemV4({
		ctx,
		payload: {
			customerId: payload.customerId,
			entityId: claimed.entityId,
			orgId: payload.orgId,
			env: payload.env,
			timestamp: payload.timestamp,
			rolloverIds: claimed.rolloverIds,
			modifiedCusEntIdsByFeatureId: claimed.modifiedCusEntIdsByFeatureId,
			usageWindowUpdates: claimed.usageWindowUpdates,
		},
	});

	// Only after a successful flush (syncItemV4 handles conflicts internally
	// by invalidating the cache — that counts as handled).
	await clearSyncClaim({ redis, scope, generation: claimed.generation });
};
