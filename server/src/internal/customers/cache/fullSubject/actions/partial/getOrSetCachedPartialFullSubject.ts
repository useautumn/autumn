import {
	CustomerNotFoundError,
	EntityNotFoundError,
	type FullSubject,
} from "@autumn/shared";
import { shouldUseRedis } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getFullSubjectNormalized } from "@/internal/customers/repos/getFullSubject/index.js";
import { filterFullSubjectByFeatureIds } from "../../filterFullSubjectByFeatureIds.js";
import { rehydrateWithLiveBalances } from "../rehydrateWithLiveBalances.js";
import { setCachedFullSubject } from "../setCachedFullSubject/setCachedFullSubject.js";
import { getCachedPartialFullSubject } from "./getCachedPartialFullSubject.js";

export const getOrSetCachedPartialFullSubject = async ({
	ctx,
	customerId,
	entityId,
	featureIds,
	source,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
	featureIds: string[];
	source?: string;
}): Promise<FullSubject> => {
	const { skipCache, logger } = ctx;
	const useRedis = !skipCache && shouldUseRedis();

	let fetchedSubjectViewEpoch = 0;

	if (useRedis) {
		// Pipeline inside getCachedPartialFullSubject already fetches the
		// epoch, so we reuse it on miss.
		const { fullSubject: cached, subjectViewEpoch } =
			await getCachedPartialFullSubject({
				ctx,
				customerId,
				entityId,
				featureIds,
				source,
			});
		fetchedSubjectViewEpoch = subjectViewEpoch;

		if (cached) {
			logger.debug(
				`[getOrSetCachedPartialFullSubject] Subject hit for ${customerId}${entityId ? `:${entityId}` : ""}, source: ${source}`,
			);
			return cached;
		}
	}

	logger.debug(
		`[getOrSetCachedPartialFullSubject] Cache miss for ${customerId}${entityId ? `:${entityId}` : ""}, fetching from DB, source: ${source}`,
	);

	const result = await getFullSubjectNormalized({
		ctx,
		customerId,
		entityId,
	});

	if (!result) {
		if (entityId) throw new EntityNotFoundError({ entityId });
		throw new CustomerNotFoundError({ customerId });
	}

	const { normalized, fullSubject } = result;

	if (useRedis) {
		await setCachedFullSubject({
			ctx,
			normalized,
			fetchedSubjectViewEpoch,
		});

		// We just wrote the subject blob ourselves — skip re-reading it. Only
		// the balance hashes need a fresh read to preserve any HSETNX-skipped
		// in-flight Lua deduction patches. One RTT instead of two.
		const withLiveBalances = await rehydrateWithLiveBalances({
			ctx,
			normalized,
		});
		if (withLiveBalances) {
			return filterFullSubjectByFeatureIds({
				fullSubject: withLiveBalances,
				featureIds,
			});
		}
	}

	return filterFullSubjectByFeatureIds({
		fullSubject,
		featureIds,
	});
};
