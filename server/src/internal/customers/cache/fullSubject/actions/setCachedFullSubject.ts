import type { NormalizedFullSubject } from "@autumn/shared";
import { redisV2 } from "@/external/redis/initRedisV2.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import { generateId } from "@/utils/genUtils.js";
import { featureBalancesToHashFields } from "../balances/featureBalancesToHashFields.js";
import { buildFullSubjectBalanceKey } from "../builders/buildFullSubjectBalanceKey.js";
import { buildFullSubjectGuardKey } from "../builders/buildFullSubjectGuardKey.js";
import { buildFullSubjectKey } from "../builders/buildFullSubjectKey.js";
import { buildFullSubjectReserveKey } from "../builders/buildFullSubjectReserveKey.js";
import {
	FULL_SUBJECT_CACHE_RESERVE_TTL_SECONDS,
	FULL_SUBJECT_CACHE_TTL_SECONDS,
} from "../config/fullSubjectCacheConfig.js";
import { normalizedToCachedFullSubject } from "../fullSubjectCacheModel.js";

export type SetCachedFullSubjectResult =
	| "OK"
	| "STALE_WRITE"
	| "CACHE_EXISTS"
	| "FAILED";

export const setCachedFullSubject = async ({
	ctx,
	normalized,
	fetchTimeMs,
	overwrite = false,
}: {
	ctx: AutumnContext;
	normalized: NormalizedFullSubject;
	fetchTimeMs: number;
	overwrite?: boolean;
}): Promise<SetCachedFullSubjectResult> => {
	const { org, env, logger } = ctx;
	const { customerId, entityId } = normalized;
	const subjectKey = buildFullSubjectKey({
		orgId: org.id,
		env,
		customerId,
		entityId,
	});
	const reserveKey = buildFullSubjectReserveKey({
		orgId: org.id,
		env,
		customerId,
		entityId,
	});
	const guardKey = buildFullSubjectGuardKey({
		orgId: org.id,
		env,
		customerId,
		entityId,
	});
	const cached = normalizedToCachedFullSubject({ normalized });
	const token = generateId("full_subject_res");

	const balancesByFeatureId = new Map<
		string,
		typeof normalized.customer_entitlements
	>();
	for (const customerEntitlement of normalized.customer_entitlements) {
		const existing =
			balancesByFeatureId.get(customerEntitlement.feature_id) ?? [];
		existing.push(customerEntitlement);
		balancesByFeatureId.set(customerEntitlement.feature_id, existing);
	}

	const balanceWrites = Array.from(balancesByFeatureId.entries()).map(
		([featureId, balances]) => {
			const balanceKey = buildFullSubjectBalanceKey({
				orgId: org.id,
				env,
				customerId,
				entityId,
				featureId,
			});

			return {
				balanceKey,
				fields: featureBalancesToHashFields({ featureId, balances }),
			};
		},
	);

	let reserved = false;

	const result = await tryRedisWrite(async () => {
		if (!overwrite) {
			const reserveResult = await redisV2.reserveFullSubjectWrite(
				subjectKey,
				reserveKey,
				guardKey,
				token,
				String(FULL_SUBJECT_CACHE_RESERVE_TTL_SECONDS),
				String(overwrite),
				String(fetchTimeMs),
			);

			if (reserveResult === "CACHE_EXISTS") {
				return "CACHE_EXISTS" as const;
			}
			if (reserveResult === "STALE_WRITE") {
				return "STALE_WRITE" as const;
			}

			reserved = true;
		}

		const multi = redisV2.multi();

		for (const { balanceKey, fields } of balanceWrites) {
			multi.del(balanceKey);
			multi.hset(balanceKey, fields);
			multi.expire(balanceKey, FULL_SUBJECT_CACHE_TTL_SECONDS);
		}

		multi.set(
			subjectKey,
			JSON.stringify(cached),
			"EX",
			FULL_SUBJECT_CACHE_TTL_SECONDS,
		);

		await multi.exec();
		return "OK" as const;
	}, redisV2);

	const subjectLabel = entityId ? `${customerId}:${entityId}` : customerId;
	try {
		logger.info(
			`[setCachedFullSubject] ${subjectLabel}: ${result ?? "FAILED"}, balances=${cached.meteredFeatures.length}`,
		);
	} finally {
		if (reserved) {
			await tryRedisWrite(
				() => redisV2.releaseFullSubjectReservation(reserveKey, token),
				redisV2,
			);
		}
	}

	return result ?? "FAILED";
};
