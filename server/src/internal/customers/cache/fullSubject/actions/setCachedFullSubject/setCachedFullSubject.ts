import type { NormalizedFullSubject } from "@autumn/shared";
import { redisV2 } from "@/external/redis/initRedisV2.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import { FULL_SUBJECT_CACHE_TTL_SECONDS } from "../../config/fullSubjectCacheConfig.js";
import { normalizedToCachedFullSubject } from "../../fullSubjectCacheModel.js";
import { getOrInitFullSubjectViewEpoch } from "../invalidate/getOrInitFullSubjectViewEpoch.js";
import type { SetCachedFullSubjectResult } from "./fullSubjectWriteTypes.js";
import {
	appendCachedFullSubjectViewWrite,
	releaseCachedFullSubjectViewWrite,
	reserveCachedFullSubjectViewWrite,
} from "./setCachedFullSubjectView.js";
import { appendSharedFullSubjectBalanceWrite } from "./setSharedFullSubjectBalances.js";

export type { SetCachedFullSubjectResult } from "./fullSubjectWriteTypes.js";

export const setCachedFullSubject = async ({
	ctx,
	normalized,
	fetchTimeMs,
	fetchedSubjectViewEpoch,
	overwrite = false,
}: {
	ctx: AutumnContext;
	normalized: NormalizedFullSubject;
	fetchTimeMs: number;
	fetchedSubjectViewEpoch: number;
	overwrite?: boolean;
}): Promise<SetCachedFullSubjectResult> => {
	const { logger } = ctx;
	const { customerId, entityId } = normalized;
	const currentSubjectViewEpoch = await getOrInitFullSubjectViewEpoch({
		ctx,
		customerId,
	});
	if (currentSubjectViewEpoch !== fetchedSubjectViewEpoch) {
		return "STALE_WRITE";
	}
	const cached = normalizedToCachedFullSubject({
		normalized,
		subjectViewEpoch: currentSubjectViewEpoch,
	});
	const subjectViewReservation = await reserveCachedFullSubjectViewWrite({
		ctx,
		customerId,
		entityId,
		fetchTimeMs,
		overwrite,
	});

	if (subjectViewReservation.status !== "OK") {
		return subjectViewReservation.status;
	}

	const latestSubjectViewEpoch = await getOrInitFullSubjectViewEpoch({
		ctx,
		customerId,
	});
	if (latestSubjectViewEpoch !== fetchedSubjectViewEpoch) {
		await releaseCachedFullSubjectViewWrite({
			reservation: subjectViewReservation.reservation,
		});
		return "STALE_WRITE";
	}

	const result = await tryRedisWrite(async () => {
		const multi = redisV2.multi();

		await appendSharedFullSubjectBalanceWrite({
			ctx,
			multi,
			normalized,
			meteredFeatures: cached.meteredFeatures,
			overwrite,
			ttlSeconds: FULL_SUBJECT_CACHE_TTL_SECONDS,
		});
		appendCachedFullSubjectViewWrite({
			multi,
			subjectKey: subjectViewReservation.subjectKey,
			cached,
			ttlSeconds: FULL_SUBJECT_CACHE_TTL_SECONDS,
		});

		await multi.exec();
		return "OK" as const;
	}, redisV2);

	const subjectLabel = entityId ? `${customerId}:${entityId}` : customerId;
	try {
		logger.info(
			`[setCachedFullSubject] ${subjectLabel}: ${result ?? "FAILED"}, balances=${cached.meteredFeatures.length}`,
		);
	} finally {
		await releaseCachedFullSubjectViewWrite({
			reservation: subjectViewReservation.reservation,
		});
	}

	return result ?? "FAILED";
};
