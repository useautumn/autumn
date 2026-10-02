import type { CachePushContext } from "../types/cachePushContext.js";
import type { CacheSubjectRef } from "../types/cacheSubjectRef.js";
import { orgToAtomOrg } from "../utils/orgToAtomOrg.js";
import { readSubjectAtomTargets } from "./readSubjectAtomTargets.js";
import { readSubjectState } from "./readSubjectState.js";
import { sendSubjectToAtom } from "./sendSubjectToAtom.js";

/** One subject into every Atom that holds it, as its worker holds it now; skipped when none does. */
export const pushSubjectToCache = async ({
	ctx,
	cacheSubject,
}: {
	ctx: CachePushContext;
	cacheSubject: CacheSubjectRef;
}): Promise<void> => {
	const { identity, logOffset } = cacheSubject;
	const targets = await readSubjectAtomTargets({ ctx, identity });
	if (!targets) return;

	// Taken before the read: a catalog change that lands during it must still count as newer.
	const readAt = Date.now();
	const { state, catalog } = await readSubjectState({
		ctx,
		identity,
		org: targets.org,
	});
	const body = {
		state,
		catalog,
		org: orgToAtomOrg({ org: targets.org }),
		log_offset: logOffset.toString(),
		read_at: readAt,
	};
	await Promise.all(
		targets.atomConnections.map((atomConnection) =>
			sendSubjectToAtom({ ctx, atomConnection, body }),
		),
	);
};
