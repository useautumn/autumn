import type { Redis } from "ioredis";
import type { UsageWindowUpdate } from "../../types/usageWindowUpdate.js";
import { buildSyncDirtyKeys, type SyncDirtyScope } from "./syncDirtyKeys.js";

const DIRTY_STATE_TTL_SECONDS = 24 * 60 * 60;

export const DIRTY_FIELD_PREFIXES = {
	cusEnt: "ce:",
	rollover: "ro:",
	featureCusEnt: "fc:",
	usageWindow: "uw:",
	entityId: "entityId",
} as const;

import MARK_SCRIPT from "@/_luaScriptsV2/syncDirty/markSyncDirty.lua";

export const markSyncDirty = async ({
	redis,
	scope,
	cusEntIds,
	rolloverIds,
	modifiedCusEntIdsByFeatureId,
	usageWindowUpdates,
	entityId,
	signalTtlSeconds,
}: {
	redis: Redis;
	scope: SyncDirtyScope;
	cusEntIds: string[];
	rolloverIds: string[];
	modifiedCusEntIdsByFeatureId: Record<string, string[]>;
	usageWindowUpdates: Array<{ ts: number; update: UsageWindowUpdate }>;
	entityId?: string;
	signalTtlSeconds: number;
}): Promise<{ shouldSignal: boolean }> => {
	const { dirtyKey, signalKey } = buildSyncDirtyKeys(scope);

	const fieldArgs: string[] = [];
	for (const cusEntId of cusEntIds) {
		fieldArgs.push(`${DIRTY_FIELD_PREFIXES.cusEnt}${cusEntId}`, "1");
	}
	for (const rolloverId of rolloverIds) {
		fieldArgs.push(`${DIRTY_FIELD_PREFIXES.rollover}${rolloverId}`, "1");
	}
	for (const [featureId, featureCusEntIds] of Object.entries(
		modifiedCusEntIdsByFeatureId,
	)) {
		for (const cusEntId of featureCusEntIds) {
			fieldArgs.push(
				`${DIRTY_FIELD_PREFIXES.featureCusEnt}${encodeURIComponent(featureId)}:${encodeURIComponent(cusEntId)}`,
				"1",
			);
		}
	}
	for (const { ts, update } of usageWindowUpdates) {
		fieldArgs.push(
			`${DIRTY_FIELD_PREFIXES.usageWindow}${encodeURIComponent(update.feature_id)}`,
			JSON.stringify({ ts, snapshot: update }),
		);
	}
	if (entityId) {
		fieldArgs.push(DIRTY_FIELD_PREFIXES.entityId, entityId);
	}

	if (fieldArgs.length === 0) return { shouldSignal: false };

	const result = (await redis.eval(
		MARK_SCRIPT,
		2,
		dirtyKey,
		signalKey,
		signalTtlSeconds.toString(),
		DIRTY_STATE_TTL_SECONDS.toString(),
		...fieldArgs,
	)) as number;

	return { shouldSignal: result === 1 };
};
