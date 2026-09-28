import { randomUUID } from "node:crypto";
import CLAIM_SCRIPT from "@/_luaScriptsV2/syncDirty/claimSyncDirty.lua";
import CLEAR_CLAIM_SCRIPT from "@/_luaScriptsV2/syncDirty/clearSyncClaim.lua";
import type { Redis } from "ioredis";
import type { UsageWindowUpdate } from "../../types/usageWindowUpdate.js";
import { DIRTY_FIELD_PREFIXES } from "./markSyncDirty.js";
import { buildSyncDirtyKeys, type SyncDirtyScope } from "./syncDirtyKeys.js";

/** Claim survives this long if its worker dies mid-flush; the next claim
 *  (message redelivery) merges it back in. */
const CLAIM_TTL_SECONDS = 24 * 60 * 60;

export interface ClaimedSyncState {
	cusEntIds: string[];
	rolloverIds: string[];
	modifiedCusEntIdsByFeatureId: Record<string, string[]>;
	usageWindowUpdates: UsageWindowUpdate[];
	entityId?: string;
	generation: string;
}

// A leftover claim merges markers and keeps the newest uw:* timestamp. The new
// generation takes ownership, and clearing the signal lets later writes re-signal.

const decodeClaimFields = (flat: string[]): ClaimedSyncState => {
	const state: ClaimedSyncState = {
		cusEntIds: [],
		rolloverIds: [],
		modifiedCusEntIdsByFeatureId: {},
		usageWindowUpdates: [],
		generation: "",
	};

	for (let i = 0; i < flat.length; i += 2) {
		const field = flat[i];
		const value = flat[i + 1];

		if (field.startsWith(DIRTY_FIELD_PREFIXES.cusEnt)) {
			state.cusEntIds.push(field.slice(DIRTY_FIELD_PREFIXES.cusEnt.length));
		} else if (field.startsWith(DIRTY_FIELD_PREFIXES.rollover)) {
			state.rolloverIds.push(field.slice(DIRTY_FIELD_PREFIXES.rollover.length));
		} else if (field.startsWith(DIRTY_FIELD_PREFIXES.featureCusEnt)) {
			const featureAndCusEnt = field.slice(
				DIRTY_FIELD_PREFIXES.featureCusEnt.length,
			);
			const separatorIndex = featureAndCusEnt.indexOf(":");
			if (separatorIndex === -1) continue;
			const featureId = decodeURIComponent(
				featureAndCusEnt.slice(0, separatorIndex),
			);
			const cusEntId = decodeURIComponent(
				featureAndCusEnt.slice(separatorIndex + 1),
			);
			if (!state.modifiedCusEntIdsByFeatureId[featureId]) {
				state.modifiedCusEntIdsByFeatureId[featureId] = [];
			}
			state.modifiedCusEntIdsByFeatureId[featureId].push(cusEntId);
		} else if (field.startsWith(DIRTY_FIELD_PREFIXES.usageWindow)) {
			state.usageWindowUpdates.push(
				(
					JSON.parse(value) as {
						ts: number;
						snapshot: UsageWindowUpdate;
					}
				).snapshot,
			);
		} else if (field === DIRTY_FIELD_PREFIXES.entityId) {
			state.entityId = value;
		} else if (field === "__gen") {
			state.generation = value;
		}
	}

	return state;
};

/**
 * Atomically claims the customer's dirty state for a drain. Returns null when
 * there is nothing to sync (already drained, or Redis lost the state — either
 * way the signal is a safe no-op). The claim key persists until clearSyncClaim
 * so a worker crash before the Postgres flush is recoverable on redelivery.
 */
export const claimSyncDirty = async ({
	redis,
	scope,
}: {
	redis: Redis;
	scope: SyncDirtyScope;
}): Promise<ClaimedSyncState | null> => {
	const { dirtyKey, claimKey, signalKey } = buildSyncDirtyKeys(scope);

	const result = (await redis.eval(
		CLAIM_SCRIPT,
		3,
		dirtyKey,
		claimKey,
		signalKey,
		CLAIM_TTL_SECONDS.toString(),
		randomUUID(),
	)) as string[] | null;

	if (!result || result.length === 0) return null;
	return decodeClaimFields(result);
};


/** Deletes the owned claim after a successful Postgres flush. */
export const clearSyncClaim = async ({
	redis,
	scope,
	generation,
}: {
	redis: Redis;
	scope: SyncDirtyScope;
	generation: string;
}): Promise<void> => {
	const { claimKey } = buildSyncDirtyKeys(scope);
	await redis.eval(CLEAR_CLAIM_SCRIPT, 1, claimKey, generation);
};
