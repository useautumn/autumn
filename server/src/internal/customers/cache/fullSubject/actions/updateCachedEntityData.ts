import type { Entity } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { updateEntityInCache } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/updateEntityInCache.js";
import { tryRedisRead, tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import { logAlertEvent } from "@/utils/logging/logAlertEvent.js";
import { buildFullSubjectKey } from "../builders/buildFullSubjectKey.js";
import { FULL_SUBJECT_CACHE_TTL_SECONDS } from "../config/fullSubjectCacheConfig.js";
import { invalidateCachedFullSubject } from "./invalidate/invalidateFullSubject.js";

const FULL_SUBJECT_ALERT_BYTES_THRESHOLD = 1024 * 1024;
const FULL_SUBJECT_UPDATE_SLOW_THRESHOLD_MS = 100;

export const updateCachedEntityData = async ({
	ctx,
	customerId,
	entityId,
	updates,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId: string;
	updates: Partial<
		Pick<Entity, "spend_limits" | "usage_alerts" | "overage_allowed">
	>;
}): Promise<void> => {
	if (Object.keys(updates).length === 0) return;

	updateEntityInCache({
		ctx,
		customerId,
		idOrInternalId: entityId,
		updates,
	}).catch((error) => {
		ctx.logger.error(
			`[updateCachedEntityData] V1 cache update failed for ${customerId}:${entityId}: ${error}`,
		);
	});

	const { org, env, logger, redisV2 } = ctx;
	const subjectKey = buildFullSubjectKey({
		orgId: org.id,
		env,
		customerId,
		entityId,
	});

	try {
		const currentRaw = await tryRedisRead(
			() => redisV2.get(subjectKey),
			redisV2,
		);
		if (!currentRaw) return;

		const payloadBytes = Buffer.byteLength(currentRaw, "utf8");
		if (payloadBytes > FULL_SUBJECT_ALERT_BYTES_THRESHOLD) {
			logAlertEvent({
				ctx,
				severity: "warning",
				category: "redis",
				alertKey: "redis_full_subject_payload_large",
				message: `FullSubject payload exceeded soft limit during entity cache update for ${customerId}:${entityId}`,
				source: "updateCachedEntityData",
				component: "full_subject_cache",
				data: {
					subjectKey,
					payload_bytes: payloadBytes,
					threshold_bytes: FULL_SUBJECT_ALERT_BYTES_THRESHOLD,
					redis_command: "updateFullSubjectEntityDataV2",
				},
			});
		}

		const updatesJson = JSON.stringify(updates);
		const startTime = Date.now();
		const result = await tryRedisWrite(
			() =>
				redisV2.updateFullSubjectEntityDataV2(
					subjectKey,
					updatesJson,
					String(FULL_SUBJECT_CACHE_TTL_SECONDS),
					String(Date.now()),
				),
			redisV2,
		);
		const durationMs = Date.now() - startTime;

		if (durationMs > FULL_SUBJECT_UPDATE_SLOW_THRESHOLD_MS) {
			logAlertEvent({
				ctx,
				severity: "warning",
				category: "redis",
				alertKey: "redis_full_subject_entity_update_slow",
				message: `FullSubject entity cache update was slow for ${customerId}:${entityId}`,
				source: "updateCachedEntityData",
				component: "full_subject_cache",
				data: {
					subjectKey,
					duration_ms: durationMs,
					threshold_ms: FULL_SUBJECT_UPDATE_SLOW_THRESHOLD_MS,
					redis_command: "updateFullSubjectEntityDataV2",
					payload_bytes: payloadBytes,
				},
			});
		}

		if (result === null) {
			logger.warn(
				`[updateCachedEntityData] Redis write failed for ${customerId}:${entityId}, invalidating cache`,
			);
			await invalidateCachedFullSubject({
				ctx,
				customerId,
				entityId,
				source: "updateCachedEntityData:redis_write_failed",
			});
			return;
		}

		const parsed = JSON.parse(result) as {
			success: boolean;
			updated_fields?: string[];
			cache_miss?: boolean;
			no_entity?: boolean;
		};
		if (parsed.cache_miss || parsed.no_entity) return;
		if (parsed.success) return;

		logger.warn(
			`[updateCachedEntityData] Lua update returned unsuccessful result for ${customerId}:${entityId}, invalidating cache`,
		);
		await invalidateCachedFullSubject({
			ctx,
			customerId,
			entityId,
			source: "updateCachedEntityData:lua_unsuccessful",
		});
	} catch (error) {
		logger.error(
			`[updateCachedEntityData] Failed to update entity subject for ${customerId}:${entityId}: ${error}`,
		);
		await invalidateCachedFullSubject({
			ctx,
			customerId,
			entityId,
			source: "updateCachedEntityData:error",
		});
	}
};
