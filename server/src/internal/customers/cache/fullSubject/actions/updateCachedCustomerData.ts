import type { Customer } from "@autumn/shared";
import { redisV2 } from "@/external/redis/initRedisV2.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { tryRedisRead, tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import { logAlertEvent } from "@/utils/logging/logAlertEvent.js";
import { buildFullSubjectKey } from "../builders/buildFullSubjectKey.js";
import { FULL_SUBJECT_CACHE_TTL_SECONDS } from "../config/fullSubjectCacheConfig.js";
import { invalidateCachedFullSubject } from "./invalidateCachedFullSubject.js";

const FULL_SUBJECT_ALERT_BYTES_THRESHOLD = 1024 * 1024;
const FULL_SUBJECT_UPDATE_SLOW_THRESHOLD_MS = 100;

export const updateCachedCustomerData = async ({
	ctx,
	customerId,
	updates,
}: {
	ctx: AutumnContext;
	customerId: string;
	updates: Partial<Customer>;
}): Promise<void> => {
	if (Object.keys(updates).length === 0) return;

	const { org, env, logger } = ctx;
	const subjectKey = buildFullSubjectKey({
		orgId: org.id,
		env,
		customerId,
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
				message: `FullSubject payload exceeded soft limit during customer cache update for ${customerId}`,
				source: "updateCachedCustomerData",
				component: "full_subject_cache",
				data: {
					subjectKey,
					payload_bytes: payloadBytes,
					threshold_bytes: FULL_SUBJECT_ALERT_BYTES_THRESHOLD,
					redis_command: "updateFullSubjectCustomerDataV2",
				},
			});
		}

		const updatesJson = JSON.stringify(updates);
		const startTime = Date.now();
		const result = await tryRedisWrite(
			() =>
				redisV2.updateFullSubjectCustomerDataV2(
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
				alertKey: "redis_full_subject_customer_update_slow",
				message: `FullSubject customer cache update was slow for ${customerId}`,
				source: "updateCachedCustomerData",
				component: "full_subject_cache",
				data: {
					subjectKey,
					duration_ms: durationMs,
					threshold_ms: FULL_SUBJECT_UPDATE_SLOW_THRESHOLD_MS,
					redis_command: "updateFullSubjectCustomerDataV2",
					payload_bytes: payloadBytes,
				},
			});
		}

		if (result === null) {
			logger.warn(
				`[updateCachedCustomerData] Redis write failed for ${customerId}, invalidating cache`,
			);
			await invalidateCachedFullSubject({
				ctx,
				customerId,
				source: "updateCachedCustomerData:redis_write_failed",
			});
			return;
		}

		const parsed = JSON.parse(result) as {
			success: boolean;
			updated_fields?: string[];
			cache_miss?: boolean;
		};
		if (parsed.cache_miss) return;
		if (parsed.success) return;

		logger.warn(
			`[updateCachedCustomerData] Lua update returned unsuccessful result for ${customerId}, invalidating cache`,
		);
		await invalidateCachedFullSubject({
			ctx,
			customerId,
			source: "updateCachedCustomerData:lua_unsuccessful",
		});
	} catch (error) {
		logger.error(
			`[updateCachedCustomerData] Failed to update subject for ${customerId}: ${error}`,
		);
		await invalidateCachedFullSubject({
			ctx,
			customerId,
			source: "updateCachedCustomerData:error",
		});
	}
};
