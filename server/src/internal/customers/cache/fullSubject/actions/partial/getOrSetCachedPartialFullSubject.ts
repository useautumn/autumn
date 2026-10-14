import { usesSubjectCache } from "../../usesSubjectCache.js";
import {
	CustomerNotFoundError,
	EntityNotFoundError,
	type FullSubject,
} from "@autumn/shared";
import type { SubjectReadFrom } from "@/db/resolveSubjectReadDb.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getFullSubjectNormalized } from "@/internal/customers/repos/getFullSubject/index.js";
import { filterDrainedLooseEntitlements } from "../../filterDrainedLooseEntitlements.js";
import { filterFullSubjectByFeatureIds } from "../../filterFullSubjectByFeatureIds.js";
import { isReplicaSourced } from "../../subjectProvenance.js";
import { rehydrateWithLiveBalances } from "../rehydrateWithLiveBalances.js";
import { setCachedFullSubject } from "../setCachedFullSubject/setCachedFullSubject.js";
import { getCachedPartialFullSubject } from "./getCachedPartialFullSubject.js";

export const getOrSetCachedPartialFullSubject = async ({
	ctx,
	customerId,
	entityId,
	featureIds,
	source,
	readFrom = "primary",
	useDelayedPostgresBackupRead = false,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
	featureIds: string[];
	source?: string;
	readFrom?: SubjectReadFrom;
	useDelayedPostgresBackupRead?: boolean;
}): Promise<FullSubject> => {
	const { logger } = ctx;
	const useRedis = usesSubjectCache({ ctx, customerId });

	let fetchedSubjectViewEpoch = 0;

	if (useRedis) {
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
			if (ctx.subjectReadTrace) ctx.subjectReadTrace.source = "cache";
			return filterDrainedLooseEntitlements({ fullSubject: cached });
		}
	}

	logger.debug(
		`[getOrSetCachedPartialFullSubject] Cache miss for ${customerId}${entityId ? `:${entityId}` : ""}, fetching from DB, source: ${source}`,
	);

	const result = await getFullSubjectNormalized({
		ctx,
		customerId,
		entityId,
		readFrom,
		routeSource: source,
		useDelayedPostgresBackupRead,
	});

	if (!result) {
		if (entityId) throw new EntityNotFoundError({ entityId });
		throw new CustomerNotFoundError({ customerId });
	}

	const { normalized, fullSubject } = result;

	if (useRedis && !isReplicaSourced(normalized)) {
		await setCachedFullSubject({
			ctx,
			normalized,
			fetchedSubjectViewEpoch,
		});

		const withLiveBalances = await rehydrateWithLiveBalances({
			ctx,
			normalized,
		});
		if (withLiveBalances) {
			return filterDrainedLooseEntitlements({
				fullSubject: filterFullSubjectByFeatureIds({
					fullSubject: withLiveBalances,
					featureIds,
				}),
			});
		}
	}

	return filterDrainedLooseEntitlements({
		fullSubject: filterFullSubjectByFeatureIds({
			fullSubject,
			featureIds,
		}),
	});
};
