import { postEveInputResponse } from "./client.js";
import { removePendingRequests } from "./sessionState.js";

type PostEveInputResponseInput = Parameters<typeof postEveInputResponse>[0];

/** Answers a park and moves the in-memory session past it; persisting the
 * row stays with the caller, which knows when the turn has settled. */
export const answerEveInput = async (input: PostEveInputResponseInput) => {
	const posted = await postEveInputResponse(input);
	removePendingRequests({
		requestIds: new Set([input.requestId, ...(input.siblingRequestIds ?? [])]),
		session: input.session,
	});
	return posted;
};
