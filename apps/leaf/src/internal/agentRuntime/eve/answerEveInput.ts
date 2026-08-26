import { adoptPostedEveSession } from "./adoptPostedSession.js";
import { postEveInputResponse } from "./client.js";
import type { EveSessionState } from "./types.js";

type PostEveInputResponseInput = Parameters<typeof postEveInputResponse>[0];

/** Answers a park and moves the in-memory session past it; persisting the
 * row stays with the caller, which knows when the turn has settled. */
export const answerEveInput = async ({
	status = "running",
	...input
}: PostEveInputResponseInput & { status?: EveSessionState["status"] }) => {
	const posted = await postEveInputResponse(input);
	adoptPostedEveSession({ posted, session: input.session, status });
	input.session.state.pendingRequests = [];
	return posted;
};
