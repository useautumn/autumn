import {
	CustomerNotFoundError,
	EntityNotFoundError,
	type FullSubject,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getFullSubjectNormalized } from "@/internal/customers/repos/getFullSubject/index.js";
import { filterFullSubjectByFeatureIds } from "../../filterFullSubjectByFeatureIds.js";
import { rehydrateWithLiveBalances } from "../rehydrateWithLiveBalances.js";
import { setCachedFullSubject } from "../setCachedFullSubject/setCachedFullSubject.js";
import { getCachedPartialFullSubject } from "./getCachedPartialFullSubject.js";

const inFlightPartialFullSubjectHydrations = new WeakMap<
	object,
	Map<string, Promise<FullSubject>>
>();

const getPartialFullSubjectHydrationKey = ({
	ctx,
	customerId,
	entityId,
	featureIds,
	subjectViewEpoch,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
	featureIds: string[];
	subjectViewEpoch: number;
}): string =>
	JSON.stringify({
		orgId: ctx.org.id,
		env: ctx.env,
		customerId,
		entityId,
		featureIds: [...new Set(featureIds)].sort(),
		subjectViewEpoch,
	});

const clearPartialFullSubjectHydration = ({
	redis,
	hydrationKey,
	hydrationPromise,
}: {
	redis: object;
	hydrationKey: string;
	hydrationPromise: Promise<FullSubject>;
}): void => {
	const redisHydrations = inFlightPartialFullSubjectHydrations.get(redis);
	if (redisHydrations?.get(hydrationKey) !== hydrationPromise) return;

	redisHydrations.delete(hydrationKey);
	if (redisHydrations.size === 0) {
		inFlightPartialFullSubjectHydrations.delete(redis);
	}
};

const runPartialFullSubjectHydrationSingleFlight = ({
	ctx,
	hydrationKey,
	hydrate,
}: {
	ctx: AutumnContext;
	hydrationKey: string;
	hydrate: () => Promise<FullSubject>;
}): Promise<FullSubject> => {
	const redis = ctx.redisV2;
	let redisHydrations = inFlightPartialFullSubjectHydrations.get(redis);

	if (!redisHydrations) {
		redisHydrations = new Map();
		inFlightPartialFullSubjectHydrations.set(redis, redisHydrations);
	}

	const existingHydration = redisHydrations.get(hydrationKey);
	if (existingHydration) return existingHydration;

	const hydrationPromise = Promise.resolve().then(hydrate);
	redisHydrations.set(hydrationKey, hydrationPromise);

	void hydrationPromise.then(
		() =>
			clearPartialFullSubjectHydration({
				redis,
				hydrationKey,
				hydrationPromise,
			}),
		() =>
			clearPartialFullSubjectHydration({
				redis,
				hydrationKey,
				hydrationPromise,
			}),
	);

	return hydrationPromise;
};

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
	const useRedis = !skipCache;

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

	const hydrate = async (): Promise<FullSubject> => {
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

	if (!useRedis) return hydrate();

	return runPartialFullSubjectHydrationSingleFlight({
		ctx,
		hydrationKey: getPartialFullSubjectHydrationKey({
			ctx,
			customerId,
			entityId,
			featureIds,
			subjectViewEpoch: fetchedSubjectViewEpoch,
		}),
		hydrate,
	});
};
