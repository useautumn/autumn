import {
	CustomerNotFoundError,
	EntityNotFoundError,
	type FullSubject,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getFullSubjectNormalized } from "@/internal/customers/repos/getFullSubject/index.js";
import { getCachedFullSubject } from "./getCachedFullSubject.js";
import { rehydrateWithLiveBalances } from "./rehydrateWithLiveBalances.js";
import { setCachedFullSubject } from "./setCachedFullSubject/setCachedFullSubject.js";

export const getOrSetCachedFullSubject = async ({
	ctx,
	customerId,
	entityId,
	source,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
	source?: string;
}): Promise<FullSubject> => {
	const { skipCache, logger } = ctx;
	const useRedis = !skipCache;

	let fetchedSubjectViewEpoch = 0;

	if (useRedis) {
		// The pipeline inside getCachedFullSubject already fetches + refreshes
		// the epoch, so we reuse it on miss instead of a second round trip.
		const { fullSubject: cached, subjectViewEpoch } =
			await getCachedFullSubject({
				ctx,
				customerId,
				entityId,
				source,
			});
		fetchedSubjectViewEpoch = subjectViewEpoch;

		if (cached) {
			logger.debug(
				`[getOrSetCachedFullSubject] Subject hit for ${customerId}${entityId ? `:${entityId}` : ""}, source: ${source}`,
			);
			return cached;
		}
	}

	logger.debug(
		`[getOrSetCachedFullSubject] Cache miss for ${customerId}${entityId ? `:${entityId}` : ""}, fetching from DB, source: ${source}`,
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

		// We just wrote the subject blob ourselves, so no need to re-read it.
		// But balance hashes use HSETNX, so any concurrent Lua deduction that
		// patched a balance in flight survives our write — re-reading the
		// balance hashes (1 RTT) preserves those patches.
		const withLiveBalances = await rehydrateWithLiveBalances({
			ctx,
			normalized,
		});
		if (withLiveBalances) return withLiveBalances;
	}

	return fullSubject;
};
