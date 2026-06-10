import type { AutumnEvalToolName } from "../../harness/context/types.js";

export type ExpectedApiCall = {
	body?: Record<string, unknown>;
	toolName: AutumnEvalToolName;
};

export type LegacyEvalExpected = {
	apiCalls?: ExpectedApiCall[];
	finalTextIncludes?: string[];
	toolCalls?: AutumnEvalToolName[];
};

export type ToolsCalledExpectation = {
	toolNames: AutumnEvalToolName[];
	type: "tools.called";
};

export type ApiCalledExpectation = {
	calls: ExpectedApiCall[];
	type: "api.called";
};

export type ApiCalledInOrderExpectation = {
	calls: ExpectedApiCall[];
	type: "api.calledInOrder";
};

export type ResponseMentionsExpectation = {
	phrases: string[];
	type: "response.mentions";
};

export type EvalExpectation =
	| ApiCalledExpectation
	| ApiCalledInOrderExpectation
	| ResponseMentionsExpectation
	| ToolsCalledExpectation;

export type EvalExpected =
	| LegacyEvalExpected
	| (EvalExpectation[] & LegacyEvalExpected);
