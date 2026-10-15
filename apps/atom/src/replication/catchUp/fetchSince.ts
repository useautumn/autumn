import type { CatalogRow } from "@autumn/balance-engine";
import type { TenantAtom } from "../../multiTenant/atomFolders.js";
import type {
	CatalogRows,
	SubjectKey,
	SubjectSource,
} from "../../slots/types/slots.js";
import type { JournalKeyRow } from "../../state/journal/types/journal.js";
import type {
	AppliedSubject,
	SubjectCursor,
	SubjectDigest,
} from "../../state/repos/subjectStates.js";
import {
	appliedSubjectToWire,
	digestToWire,
	wireToAppliedSubject,
	wireToDigest,
} from "../../threads/owners/ownerCallContract.js";
import type {
	AppliedSubjectOnWire,
	SubjectDigestOnWire,
} from "../../threads/owners/types/ownerCall.js";
import { peerRequestHeaders } from "../transport/peerSignature.js";

export const PEER_SUBJECTS_SINCE_PATH = "/v1/_peer/subjects.since";
export const PEER_SUBJECTS_DIGEST_PATH = "/v1/_peer/subjects.digest";
export const PEER_SUBJECTS_FETCH_PATH = "/v1/_peer/subjects.fetch";
export const PEER_CATALOG_SINCE_PATH = "/v1/_peer/catalog.since";
export const PEER_KEYS_RECENT_PATH = "/v1/_peer/keys.recent";
/** The tenants a multi-tenant peer holds, so a replica learns them before it serves. */
export const PEER_ATOMS_LIST_PATH = "/v1/_peer/atoms.list";
const FETCH_TIMEOUT_MS = 10_000;

export type SubjectsSinceRequest = {
	slot: number;
	slotCount: number;
	after: number | null;
	window: number | null;
	cursor: SubjectCursor | null;
	limit: number;
};
export type SubjectsDigestResponse = {
	after: number | null;
	digests: SubjectDigestOnWire[];
};
export type SubjectsFetchRequest = {
	slot: number;
	slotCount: number;
	keys: SubjectKey[];
};
export type SubjectsFetchResponse = { subjects: AppliedSubjectOnWire[] };
export type SubjectsSinceResponse = {
	after: number | null;
	subjects: AppliedSubjectOnWire[];
};
export type CatalogSinceRequest = { readAtAfter: number };
export type RecentKeysRequest = {
	slot: number;
	slotCount: number;
	after: JournalKeyRow | null;
	limit: number;
};
export type RecentKeysResponse = { keys: JournalKeyRow[] };
export type AtomsListResponse = { atoms: { id: string; token_hash: string }[] };
export type CatalogSinceResponse = {
	catalog: { rows: CatalogRow[]; read_at: number } | null;
};

export const subjectsSinceResponse = ({
	after,
	subjects,
}: {
	after: number | null;
	subjects: AppliedSubject[];
}): SubjectsSinceResponse => ({
	after,
	subjects: subjects.map(appliedSubjectToWire),
});

export const subjectsDigestResponse = ({
	after,
	digests,
}: {
	after: number | null;
	digests: SubjectDigest[];
}): SubjectsDigestResponse => ({ after, digests: digests.map(digestToWire) });

export const subjectsFetchResponse = (
	subjects: AppliedSubject[],
): SubjectsFetchResponse => ({
	subjects: subjects.map(appliedSubjectToWire),
});

export const catalogSinceResponse = (
	catalog: CatalogRows | null,
): CatalogSinceResponse => ({
	catalog: catalog && { rows: catalog.rows, read_at: catalog.readAt },
});

/** A peer that is not ready answers this: its store may still be behind, so nothing is copied from it. */
export class PeerNotReadyError extends Error {
	override readonly name = "PeerNotReadyError";
}

/** A peer asked about one folder: a tenant's on a multi-tenant Atom, null for the one folder of an org's own. */
type PeerSourceContext = {
	peer: string;
	port: number;
	secret: string;
	atomId: string | null;
	fetch?: typeof fetch;
};

const postToPeer = async <Reply>({
	ctx,
	path,
	body,
}: {
	ctx: PeerSourceContext;
	path: string;
	body: string;
}) => {
	const response = await (ctx.fetch ?? fetch)(
		`http://${ctx.peer}:${ctx.port}${path}`,
		{
			method: "POST",
			headers: peerRequestHeaders({
				secret: ctx.secret,
				method: "POST",
				path,
				atomId: ctx.atomId,
				body,
			}),
			body,
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		},
	);
	if (response.status === 503)
		throw new PeerNotReadyError(`Peer ${ctx.peer} is not ready`);
	if (!response.ok)
		throw new Error(`Peer ${ctx.peer} answered ${response.status} to ${path}`);
	return (await response.json()) as Reply;
};

/** The tenants a multi-tenant peer holds; an org's own Atom's peer answers none. */
export const listPeerAtoms = async ({
	ctx,
}: {
	ctx: Omit<PeerSourceContext, "atomId">;
}): Promise<TenantAtom[]> => {
	const { atoms } = await postToPeer<AtomsListResponse>({
		ctx: { ...ctx, atomId: null },
		path: PEER_ATOMS_LIST_PATH,
		body: "{}",
	});
	return atoms.map(({ id, token_hash }) => ({ id, tokenHash: token_hash }));
};

/** One peer as a subject source for one folder: each request signed like any peer request, the answers read back into subjects. */
export const createPeerSubjectSource = ({
	ctx,
}: {
	ctx: PeerSourceContext;
}): SubjectSource => ({
	since: async (params) => {
		const reply = await postToPeer<SubjectsSinceResponse>({
			ctx,
			path: PEER_SUBJECTS_SINCE_PATH,
			body: JSON.stringify(params satisfies SubjectsSinceRequest),
		});
		return {
			after: reply.after,
			subjects: reply.subjects.map(wireToAppliedSubject),
		};
	},
	digest: async (params) => {
		const reply = await postToPeer<SubjectsDigestResponse>({
			ctx,
			path: PEER_SUBJECTS_DIGEST_PATH,
			body: JSON.stringify(params satisfies SubjectsSinceRequest),
		});
		return { after: reply.after, digests: reply.digests.map(wireToDigest) };
	},
	fetch: async (params) => {
		const reply = await postToPeer<SubjectsFetchResponse>({
			ctx,
			path: PEER_SUBJECTS_FETCH_PATH,
			body: JSON.stringify(params satisfies SubjectsFetchRequest),
		});
		return reply.subjects.map(wireToAppliedSubject);
	},
	catalog: async (params) => {
		const { catalog } = await postToPeer<CatalogSinceResponse>({
			ctx,
			path: PEER_CATALOG_SINCE_PATH,
			body: JSON.stringify(params satisfies CatalogSinceRequest),
		});
		return catalog && { rows: catalog.rows, readAt: catalog.read_at };
	},
	recentKeys: async (params) => {
		const { keys } = await postToPeer<RecentKeysResponse>({
			ctx,
			path: PEER_KEYS_RECENT_PATH,
			body: JSON.stringify(params satisfies RecentKeysRequest),
		});
		return keys;
	},
});
