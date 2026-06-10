import type { ResponseMentionsExpectation } from "./types.js";

export const response = {
	mentions: ({
		phrases,
	}: {
		phrases: string[];
	}): ResponseMentionsExpectation => ({
		phrases,
		type: "response.mentions",
	}),
};
