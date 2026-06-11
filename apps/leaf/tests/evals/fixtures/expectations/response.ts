import type {
	ResponseAskedBeforeToolExpectation,
	ResponseAskedExpectation,
	ResponseConciseExpectation,
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
	/**
	 * LLM-judged conciseness: the final reply must state every required fact
	 * with zero removable sentences. Facts are checked semantically, not verbatim.
	 */
	concise: ({
		required,
	}: {
		required: string[];
	}): ResponseConciseExpectation => ({
		required,
		type: "response.concise",
	}),
	mentions: ({
		notPhrases,
		phrases,
	}: {
		phrases: string[];
		notPhrases?: string[];
	}): ResponseMentionsExpectation => ({
		...(notPhrases ? { notPhrases } : {}),
		phrases,
		type: "response.mentions",
	}),
};
