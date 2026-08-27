import { db } from "../../../lib/db.js";
import { upsertEveSession } from "./repo.js";
import type { EveSessionRef, EveSessionState } from "./types.js";

export const initialEveSessionState = (
	continuationToken: string,
): EveSessionState => ({
	continuationToken,
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
