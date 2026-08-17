import {
	CustomerNotFoundError,
	EntityNotFoundError,
	type FullSubject,
} from "@autumn/shared";
import type { SubjectReadFrom } from "@/db/resolveSubjectReadDb.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getFullSubjectNormalized } from "@/internal/customers/repos/getFullSubject/index.js";
import { filterDrainedLooseEntitlements } from "../filterDrainedLooseEntitlements.js";
import { isReplicaSourced } from "../subjectProvenance.js";
import { getCachedFullSubject } from "./getCachedFullSubject.js";
import { rehydrateWithLiveBalances } from "./rehydrateWithLiveBalances.js";
import { setCachedFullSubject } from "./setCachedFullSubject/setCachedFullSubject.js";

export const getOrSetCachedFullSubject = async ({
	ctx,
	customerId,
	entityId,
	source,
	staleWhileRevalidate = true,
	runLazyResets = true,
	readFrom = "primary",
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
	source?: string;
	staleWhileRevalidate?: boolean;
	runLazyResets?: boolean;
	readFrom?: SubjectReadFrom;
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
				staleWhileRevalidate,
				runLazyResets,
			});
		fetchedSubjectViewEpoch = subjectViewEpoch;

		if (cached) {
			logger.debug(
				`[getOrSetCachedFullSubject] Subject hit for ${customerId}${entityId ? `:${entityId}` : ""}, source: ${source}`,
			);
			if (ctx.subjectReadTrace) ctx.subjectReadTrace.source = "cache";
			return filterDrainedLooseEntitlements({ fullSubject: cached });
		}
	}

	logger.debug(
		`[getOrSetCachedFullSubject] Cache miss for ${customerId}${entityId ? `:${entityId}` : ""}, fetching from DB, source: ${source}`,
	);

	const result = await getFullSubjectNormalized({
		ctx,
		customerId,
		entityId,
		runLazyResets,
		readFrom,
		routeSource: source,
	});

	if (!result) {
		if (entityId) throw new EntityNotFoundError({ entityId });
		throw new CustomerNotFoundError({ customerId });
	}

	const { normalized, fullSubject } = result;

	// Replica-sourced hydrations must never fill Redis — serve them as-is.
	if (useRedis && !isReplicaSourced(normalized)) {
		await setCachedFullSubject({
			ctx,
			normalized,
			fetchedSubjectViewEpoch,
		});
		logger.info(
			{
				type: "subject_miss_fill",
				customer_id: customerId,
				org_id: ctx.org.id,
			},
			"FullSubject cache filled from primary hydration",
		);

		// We just wrote the subject blob ourselves, so no need to re-read it.
		// But balance hashes use HSETNX, so any concurrent Lua deduction that
		// patched a balance in flight survives our write — re-reading the
		// balance hashes (1 RTT) preserves those patches.
		const withLiveBalances = await rehydrateWithLiveBalances({
			ctx,
			normalized,
		});
		// Live balance patches can drain a grant that was still live at query time.
		if (withLiveBalances)
			return filterDrainedLooseEntitlements({ fullSubject: withLiveBalances });
	}

	return filterDrainedLooseEntitlements({ fullSubject });
};
