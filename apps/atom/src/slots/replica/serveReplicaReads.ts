import type {
	AppliedSubject,
	SubjectDigest,
} from "../../state/repos/subjectStates.js";
import type { CatalogRows, SinceRequest, SubjectKey } from "../types/slots.js";
import type { ReplicaSlotsContext } from "./types/replicaSlotsContext.js";

export const serveReplicaReads = ({ ctx }: { ctx: ReplicaSlotsContext }) => {
	const { slots, owners, catalogStore, atomId } = ctx;

	async function listSince(params: SinceRequest): Promise<AppliedSubject[]> {
		const store = slots[params.slot]?.sqliteStore;
		if (store) return store.listAppliedAfter(params);
		const owner = owners.ownerOf({ slot: params.slot });
		return owners.listSinceOn({ thread: owner, atomId, ...params });
	}

	async function digestSince(params: SinceRequest): Promise<SubjectDigest[]> {
		const store = slots[params.slot]?.sqliteStore;
		if (store) return store.listDigestsAfter(params);
		const owner = owners.ownerOf({ slot: params.slot });
		return owners.digestSinceOn({ thread: owner, atomId, ...params });
	}

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

	function catalogSince({
		readAtAfter,
	}: {
		readAtAfter: number;
	}): CatalogRows | null {
		const held = catalogStore.rows();
		return held && held.readAt > readAtAfter ? held : null;
	}

	function maxAppliedAt(): number {
		return Math.max(
			0,
			...slots.flatMap(({ sqliteStore }) =>
				sqliteStore ? [sqliteStore.maxAppliedAt()] : [],
			),
		);
	}

	return { listSince, digestSince, fetchSubjects, catalogSince, maxAppliedAt };
};
