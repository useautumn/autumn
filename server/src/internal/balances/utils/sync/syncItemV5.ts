import type { AppEnv } from "@autumn/shared";
import { getOrgRedis } from "@/external/redis/orgRedisPool.js";
import { getRedisV2ByInstanceName } from "@/external/redis/resolveRedisV2.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { claimSyncDirty, clearSyncClaim } from "./dirtyState/claimSyncDirty.js";
import { syncItemV4 } from "./syncItemV4.js";

const COALESCE_WINDOW_MS =
	process.env.NODE_ENV === "dev" ||
	process.env.NODE_ENV === "test" ||
	process.env.NODE_ENV === "development"
		? 500
		: 1_000;

export interface SyncCustomerDirtyPayload {
	customerId: string;
	orgId: string;
	env: AppEnv;
	region?: string;
	redisInstance?: string;
	timestamp: number;
}

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
	const redis =
		payload.redisInstance === "org"
			? getOrgRedis({ org: ctx.org })
			: payload.redisInstance
				? (getRedisV2ByInstanceName(payload.redisInstance) ?? ctx.redisV2)
				: ctx.redisV2;

	const windowRemainingMs = payload.timestamp + COALESCE_WINDOW_MS - Date.now();
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

	await clearSyncClaim({ redis, scope, generation: claimed.generation });
};
