import type { AtomSubjectBody } from "../../../atom/types/atomClient.js";
import type { CachePushTiming } from "../pushQueue/createCachePushStats.js";
import type { CachePushContext } from "../types/cachePushContext.js";
import type { CacheSubjectRef } from "../types/cacheSubjectRef.js";
import { orgToAtomOrg } from "../utils/orgToAtomOrg.js";
import { readSubjectAtomTargets } from "./readSubjectAtomTargets.js";
import { readSubjectState } from "./readSubjectState.js";
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

	// Taken before the read: a catalog change that lands during it must still count as newer.
	const readAt = Date.now();
	const readStartedAt = performance.now();
	const { state, catalog } = await readSubjectState({
		ctx,
		identity,
		org: targets.org,
	});
	const body: AtomSubjectBody = {
		state,
		catalog,
		org: orgToAtomOrg({ org: targets.org }),
		log_offset: logOffset.toString(),
		read_at: readAt,
		...(customerVersion !== null && {
			customer_version: customerVersion.toString(),
		}),
	};
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
