import { db } from "../../../lib/db.js";
import { upsertEveSession } from "./repo.js";
import type {
	EvePendingRequest,
	EveSessionRef,
	EveSessionState,
} from "./types.js";

export const initialEveSessionState = (): EveSessionState => ({
	streamIndex: 0,
	pendingRequests: [],
});

/** Merges a patch into the live session ref, then persists the whole row. */
export const saveEveSessionState = async ({
	orgId,
	session,
	state,
}: {
	orgId: string;
	session: EveSessionRef;
	state?: Partial<EveSessionState>;
}) => {
	session.state = { ...session.state, ...state };
	await upsertEveSession({
		db,
		env: session.env,
		orgId,
		sessionId: session.sessionId,
		state: session.state,
		threadKey: session.threadKey,
	});
};

export const advanceStreamCursor = (session: EveSessionRef) => {
	session.state.streamIndex += 1;
};

export const addPendingRequests = ({
	requests,
	session,
}: {
	requests: ReadonlyArray<EvePendingRequest>;
	session: EveSessionRef;
}) => {
	const pending = new Map(
		session.state.pendingRequests.map((request) => [
			request.requestId,
			request,
		]),
	);
	for (const request of requests) pending.set(request.requestId, request);
	session.state.pendingRequests = [...pending.values()];
};

export const removePendingRequests = ({
	requestIds,
	session,
}: {
	requestIds: ReadonlySet<string>;
	session: EveSessionRef;
}) => {
	session.state.pendingRequests = session.state.pendingRequests.filter(
		(request) => !requestIds.has(request.requestId),
	);
};
