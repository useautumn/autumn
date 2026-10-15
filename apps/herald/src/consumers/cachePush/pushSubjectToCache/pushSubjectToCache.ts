import {
	atomSubjectBodyFor,
	isWorkerSubjectNotFound,
	readAtomSubjectBody,
} from "@autumn/byoc/subjects";
import type { AtomConnection } from "../../../atom/types/atomClient.js";
import type { CachePushTiming } from "../pushQueue/createCachePushStats.js";
import type { CachePushContext } from "../types/cachePushContext.js";
import type { CacheSubjectRef } from "../types/cacheSubjectRef.js";
import { readSubjectAtomTargets } from "./readSubjectAtomTargets.js";
import { sendDeletionToAtom } from "./sendDeletionToAtom.js";
import { sendSubjectToAtom } from "./sendSubjectToAtom.js";

/** One subject into every Atom that holds it, as its worker holds it now, or its deletion once it holds none; null when no Atom does. */
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
	// Taken before the read: a push of the subject created again, read after this one, outranks its deletion.
	const readAt = Date.now();
	let send: (atomConnection: AtomConnection) => Promise<void>;
	try {
		const body = await readAtomSubjectBody({
			ctx,
			identity,
			org: targets.org,
			requestId: `herald_cache_push_${crypto.randomUUID()}`,
			fallbackLogOffset: logOffset,
			customerVersion,
		});
		if (!body) return null;
		send = (atomConnection) =>
			sendSubjectToAtom({
				ctx,
				atomConnection,
				body: atomSubjectBodyFor({ body, atomId: atomConnection.id }),
			});
	} catch (error) {
		if (!isWorkerSubjectNotFound({ error })) throw error;
		const body = {
			identity,
			log_offset: logOffset.toString(),
			read_at: readAt,
		};
		send = (atomConnection) =>
			sendDeletionToAtom({ ctx, atomConnection, body });
	}
	const sendStartedAt = performance.now();
	await Promise.all(targets.atomConnections.map(send));
	return {
		targetsMs: readStartedAt - targetsStartedAt,
		readMs: sendStartedAt - readStartedAt,
		sendMs: performance.now() - sendStartedAt,
	};
};
