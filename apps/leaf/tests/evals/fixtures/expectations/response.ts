import type {
	ResponseAskedExpectation,
	ResponseAskedBeforeToolExpectation,
	ResponseMentionsExpectation,
} from "./types.js";

export const response = {
	asked: ({
		notPhrases,
		phrases,
	}: {
		phrases: string[];
		notPhrases?: string[];
	}): ResponseAskedExpectation => ({
		...(notPhrases ? { notPhrases } : {}),
		phrases,
		type: "response.asked",
	}),
	askedBeforeTool: ({
		notPhrases,
		phrases,
		toolName,
	}: {
		phrases: string[];
		toolName: ResponseAskedBeforeToolExpectation["toolName"];
		notPhrases?: string[];
	}): ResponseAskedBeforeToolExpectation => ({
		...(notPhrases ? { notPhrases } : {}),
		phrases,
		toolName,
		type: "response.askedBeforeTool",
	}),
	mentions: ({
		phrases,
	}: {
		phrases: string[];
	}): ResponseMentionsExpectation => ({
		phrases,
		type: "response.mentions",
	}),
};
