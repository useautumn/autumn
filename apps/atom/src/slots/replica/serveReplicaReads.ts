import type { JournalKeyRow } from "../../state/journal/types/journal.js";
import type {
	AppliedSubject,
	SubjectDigest,
} from "../../state/repos/subjectStates.js";
import type { CatalogRows, SinceRequest, SubjectKey } from "../types/slots.js";
import type { ReplicaSlotsContext } from "./types/replicaSlotsContext.js";

/** What this replica answers a peer's catch-up with: a slot's rows, digests and keys from the slot's owner, and the catalog. */
export const serveReplicaReads = ({ ctx }: { ctx: ReplicaSlotsContext }) => {
	const { slots, owners, catalogStore, atomId } = ctx;

	/** A slot's subjects written at or after `after`, answered by the slot's owner. */
	async function listSince(params: SinceRequest): Promise<AppliedSubject[]> {
		const store = slots[params.slot]?.sqliteStore;
		if (store) return store.listAppliedAfter(params);
		const owner = owners.ownerOf({ slot: params.slot });
		return owners.listSinceOn({ thread: owner, atomId, ...params });
	}

	/** The same pages as `listSince`, as identities and versions only. */
	async function digestSince(params: SinceRequest): Promise<SubjectDigest[]> {
		const store = slots[params.slot]?.sqliteStore;
		if (store) return store.listDigestsAfter(params);
		const owner = owners.ownerOf({ slot: params.slot });
		return owners.digestSinceOn({ thread: owner, atomId, ...params });
	}

	/** A slot's rows by key, answered by the slot's owner. */
	async function fetchSubjects({
		slot,
		keys,
	}: {
		slot: number;
		keys: SubjectKey[];
	}): Promise<AppliedSubject[]> {
		const store = slots[slot]?.sqliteStore;
		if (store) return store.readByKey({ keys });
		const owner = owners.ownerOf({ slot });
		return owners.fetchSubjectsOn({ thread: owner, atomId, slot, keys });
	}

	/** A page of a slot's idempotency keys of the last 90 min, answered by the slot's owner. */
	async function recentKeys({
		slot,
		after,
		limit,
	}: {
		slot: number;
		after: JournalKeyRow | null;
		limit: number;
	}): Promise<JournalKeyRow[]> {
		const journal = slots[slot]?.journal;
		if (journal) return journal.recentKeys({ after, limit });
		const owner = owners.ownerOf({ slot });
		return owners.recentKeysOn({ thread: owner, atomId, slot, after, limit });
	}

	/** The catalog's rows when they were read after `readAtAfter`, for a peer copying them; null otherwise. */
	function catalogSince({
		readAtAfter,
	}: {
		readAtAfter: number;
	}): CatalogRows | null {
		const held = catalogStore.rows();
		return held && held.readAt > readAtAfter ? held : null;
	}

	/** The newest write in the slots this thread owns, by this replica's clock; 0 when they are empty. */
	function maxAppliedAt(): number {
		return Math.max(
			0,
			...slots.flatMap(({ sqliteStore }) =>
				sqliteStore ? [sqliteStore.maxAppliedAt()] : [],
			),
		);
	}

	return {
		listSince,
		digestSince,
		fetchSubjects,
		recentKeys,
		catalogSince,
		maxAppliedAt,
	};
};
