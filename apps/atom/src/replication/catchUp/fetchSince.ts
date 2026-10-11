import type { SubjectSource } from "../../slots/types/slots.js";
import {
	storedSubjectToWire,
	wireToStoredSubject,
} from "../../threads/owners/ownerCallContract.js";
import type { StoredSubjectOnWire } from "../../threads/owners/types/ownerCall.js";
import { peerRequestHeaders } from "../transport/peerSignature.js";

export const PEER_SUBJECTS_SINCE_PATH = "/v1/_peer/subjects.since";
const FETCH_TIMEOUT_MS = 10_000;

export type SubjectsSinceRequest = {
	slot: number;
	slotCount: number;
	readAtAfter: number;
	limit: number;
};
export type SubjectsSinceResponse = { subjects: StoredSubjectOnWire[] };

export const subjectsSinceResponse = (
	subjects: Parameters<typeof storedSubjectToWire>[0][],
): SubjectsSinceResponse => ({ subjects: subjects.map(storedSubjectToWire) });

/** One peer as a subject source: the request signed like any peer request, the answer read back into subjects. */
export const createPeerSubjectSource = ({
	ctx,
}: {
	ctx: { peer: string; port: number; tokenHash: string };
}): SubjectSource =>
	async function fetchSince(params) {
		const body = JSON.stringify(params satisfies SubjectsSinceRequest);
		const response = await fetch(
			`http://${ctx.peer}:${ctx.port}${PEER_SUBJECTS_SINCE_PATH}`,
			{
				method: "POST",
				headers: peerRequestHeaders({ tokenHash: ctx.tokenHash, body }),
				body,
				signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			},
		);
		if (!response.ok)
			throw new Error(
				`Peer ${ctx.peer} answered ${response.status} to subjects.since`,
			);
		const { subjects } = (await response.json()) as SubjectsSinceResponse;
		return subjects.map(wireToStoredSubject);
	};
