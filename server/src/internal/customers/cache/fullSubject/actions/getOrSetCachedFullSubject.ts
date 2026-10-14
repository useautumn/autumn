import { usesSubjectCache } from "../usesSubjectCache.js";
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
	const { logger } = ctx;
	const useRedis = usesSubjectCache({ ctx, customerId });

	let fetchedSubjectViewEpoch = 0;

	if (useRedis) {
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
	fullSubject.subjectViewEpoch = fetchedSubjectViewEpoch;

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

		const withLiveBalances = await rehydrateWithLiveBalances({
			ctx,
			normalized,
		});
		if (withLiveBalances) {
			withLiveBalances.subjectViewEpoch = fetchedSubjectViewEpoch;
			return filterDrainedLooseEntitlements({ fullSubject: withLiveBalances });
		}
	}

	return filterDrainedLooseEntitlements({ fullSubject });
};
