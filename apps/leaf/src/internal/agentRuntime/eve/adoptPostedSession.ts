import type { EveSessionRef, EveSessionState } from "./types.js";

export type PostedEveSession = {
	continuationToken: string;
	sessionId: string;
};

/**
 * Applies a posted session response to the in-memory session. Eve silently
 * re-homes a dead run onto a NEW session id whose journal restarts at 0, so
 * carrying the old stream cursor over would stream past every event forever.
 */
export const adoptPostedEveSession = ({
	posted,
	session,
	status,
}: {
	posted: PostedEveSession;
	session: EveSessionRef;
	status?: EveSessionState["status"];
}) => {
	const rehomed = posted.sessionId !== session.sessionId;
	session.sessionId = posted.sessionId;
	session.state = {
		...session.state,
		continuationToken: posted.continuationToken,
		lastEventAt: Date.now(),
		...(status ? { status } : {}),
		...(rehomed ? { streamIndex: 0 } : {}),
	};
	return { rehomed };
};
