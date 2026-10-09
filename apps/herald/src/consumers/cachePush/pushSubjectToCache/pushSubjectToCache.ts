import { readAtomSubjectBody } from "@autumn/byoc/subjects";
import type { CachePushTiming } from "../pushQueue/createCachePushStats.js";
import type { CachePushContext } from "../types/cachePushContext.js";
import type { CacheSubjectRef } from "../types/cacheSubjectRef.js";
import { readSubjectAtomTargets } from "./readSubjectAtomTargets.js";
import { sendSubjectToAtom } from "./sendSubjectToAtom.js";

/** One subject into every Atom that holds it, as its worker holds it now; null when no Atom does. */
export const pushSubjectToCache = async ({
	ctx,
	cacheSubject,
}: {
	ctx: CachePushContext;
	cacheSubject: CacheSubjectRef;
}): Promise<CachePushTiming | null> => {
	const { identity, logOffset, customerVersion } = cacheSubject;
	const targetsStartedAt = performance.now();
	const targets = await readSubjectAtomTargets({ ctx, identity });
	if (!targets) return null;

	const readStartedAt = performance.now();
	const body = await readAtomSubjectBody({
		ctx,
		identity,
		org: targets.org,
		requestId: `herald_cache_push_${crypto.randomUUID()}`,
		fallbackLogOffset: logOffset,
		customerVersion,
	});
	if (!body) return null;
	const sendStartedAt = performance.now();
	await Promise.all(
		targets.atomConnections.map((atomConnection) =>
			sendSubjectToAtom({ ctx, atomConnection, body }),
		),
	);
	return {
		targetsMs: readStartedAt - targetsStartedAt,
		readMs: sendStartedAt - readStartedAt,
		sendMs: performance.now() - sendStartedAt,
	};
};
