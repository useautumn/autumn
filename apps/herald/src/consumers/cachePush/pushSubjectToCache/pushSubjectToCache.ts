import type { CachePushContext } from "../types/cachePushContext.js";
import type { CacheSubjectRef } from "../types/cacheSubjectRef.js";
import { orgToAtomOrg } from "../utils/orgToAtomOrg.js";
import { readCacheReadyOrg } from "./readCacheReadyOrg.js";
import { readSubjectState } from "./readSubjectState.js";
import { sendSubjectToAtom } from "./sendSubjectToAtom.js";

/** One subject into its org's Atom, as its worker holds it now; skipped unless that cache is ready. */
export const pushSubjectToCache = async ({
	ctx,
	cacheSubject,
}: {
	ctx: CachePushContext;
	cacheSubject: CacheSubjectRef;
}): Promise<void> => {
	const { identity, logOffset } = cacheSubject;
	const cacheOrg = await readCacheReadyOrg({ ctx, identity });
	if (!cacheOrg) return;

	const { state, catalog } = await readSubjectState({
		ctx,
		identity,
		org: cacheOrg.org,
	});
	await sendSubjectToAtom({
		ctx,
		atomConnection: cacheOrg.atomConnection,
		body: {
			state,
			catalog,
			org: orgToAtomOrg({ org: cacheOrg.org }),
			log_offset: logOffset.toString(),
		},
	});
};
