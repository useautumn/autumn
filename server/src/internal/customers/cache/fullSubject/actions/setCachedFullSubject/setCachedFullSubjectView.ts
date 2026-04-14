import { redisV2 } from "@/external/redis/initRedisV2.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import { generateId } from "@/utils/genUtils.js";
import { buildFullSubjectGuardKey } from "../../builders/buildFullSubjectGuardKey.js";
import { buildFullSubjectKey } from "../../builders/buildFullSubjectKey.js";
import { buildFullSubjectReserveKey } from "../../builders/buildFullSubjectReserveKey.js";
import { FULL_SUBJECT_CACHE_RESERVE_TTL_SECONDS } from "../../config/fullSubjectCacheConfig.js";
import type { CachedFullSubject } from "../../fullSubjectCacheModel.js";

export const reserveCachedFullSubjectViewWrite = async ({
	ctx,
	customerId,
	entityId,
	fetchTimeMs,
	overwrite,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
	fetchTimeMs: number;
	overwrite: boolean;
}): Promise<
	| {
			status: "OK";
			subjectKey: string;
			reservation?: {
				reserveKey: string;
				token: string;
			};
	  }
	| {
			status: "CACHE_EXISTS" | "STALE_WRITE";
	  }
> => {
	const { org, env } = ctx;
	const subjectKey = buildFullSubjectKey({
		orgId: org.id,
		env,
		customerId,
		entityId,
	});

	if (overwrite) {
		return {
			status: "OK",
			subjectKey,
		};
	}

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
	const token = generateId("full_subject_res");
	const reserveResult = await redisV2.reserveFullSubjectWrite(
		subjectKey,
		reserveKey,
		guardKey,
		token,
		String(FULL_SUBJECT_CACHE_RESERVE_TTL_SECONDS),
		String(overwrite),
		String(fetchTimeMs),
	);

	if (reserveResult === "CACHE_EXISTS" || reserveResult === "STALE_WRITE") {
		return {
			status: reserveResult,
		};
	}

	return {
		status: "OK",
		subjectKey,
		reservation: {
			reserveKey,
			token,
		},
	};
};

export const appendCachedFullSubjectViewWrite = ({
	multi,
	subjectKey,
	cached,
	ttlSeconds,
}: {
	multi: ReturnType<typeof redisV2.multi>;
	subjectKey: string;
	cached: CachedFullSubject;
	ttlSeconds: number;
}) => {
	multi.set(subjectKey, JSON.stringify(cached), "EX", ttlSeconds);
};

export const releaseCachedFullSubjectViewWrite = async ({
	reservation,
}: {
	reservation?: {
		reserveKey: string;
		token: string;
	};
}) => {
	if (!reservation) return;

	await tryRedisWrite(
		() =>
			redisV2.releaseFullSubjectReservation(
				reservation.reserveKey,
				reservation.token,
			),
		redisV2,
	);
};
