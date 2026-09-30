import type { CachePushContext } from "../types/cachePushContext.js";
import type { CacheSubjectRef } from "../types/cacheSubjectRef.js";
import { fullSubjectToCacheEntry } from "./fullSubjectToCacheEntry.js";
import { readCacheReadyOrg } from "./readCacheReadyOrg.js";
import { readFullSubject } from "./readFullSubject.js";
import { writeCacheEntry } from "./writeCacheEntry.js";

/** One subject into its org's cache, as its worker holds it now; skipped unless that cache is ready. */
export const pushSubjectToCache = async ({
	ctx,
	cacheSubject,
}: {
	ctx: CachePushContext;
	cacheSubject: CacheSubjectRef;
}): Promise<void> => {
	const { identity } = cacheSubject;
	const cacheOrg = await readCacheReadyOrg({ ctx, identity });
	if (!cacheOrg) return;

	const fullSubject = await readFullSubject({
		ctx,
		identity,
		org: cacheOrg.org,
	});
	const { key, entry } = await fullSubjectToCacheEntry({
		ctx,
		cacheSubject,
		fullSubject,
		cacheOrg,
	});
	await writeCacheEntry({
		ctx,
		deploymentId: cacheOrg.deploymentId,
		key,
		entry,
	});
};
