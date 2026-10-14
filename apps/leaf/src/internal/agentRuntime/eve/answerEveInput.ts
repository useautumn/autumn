import { postEveInputResponse } from "./client.js";
import { removePendingRequests } from "./sessionState.js";

type PostEveInputResponseInput = Parameters<typeof postEveInputResponse>[0];

export const answerEveInput = async (input: PostEveInputResponseInput) => {
	const posted = await postEveInputResponse(input);
	removePendingRequests({
		requestIds: new Set([input.requestId, ...(input.siblingRequestIds ?? [])]),
		session: input.session,
	});
	return posted;
};
