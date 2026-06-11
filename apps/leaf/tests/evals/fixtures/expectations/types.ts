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

export type ApiCalledAfterApprovalExpectation = {
	call: ExpectedApiCall;
	type: "api.calledAfterApproval";
};

export type ApiBodyExcludesExpectation = {
	fields: string[];
	toolName: AutumnEvalToolName;
	type: "api.bodyExcludes";
};

export type ApiBodyNumberFieldsExpectation = {
	paths: string[];
	toolName: AutumnEvalToolName;
	type: "api.bodyNumberFields";
};

export type ResponseMentionsExpectation = {
	phrases: string[];
	type: "response.mentions";
};

export type ResponseConciseExpectation = {
	required: string[];
	type: "response.concise";
};

export type ResponseAskedExpectation = {
	notPhrases?: string[];
	phrases: string[];
	type: "response.asked";
};

export type ResponseAskedBeforeToolExpectation = {
	notPhrases?: string[];
	phrases: string[];
	toolName: AutumnEvalToolName;
	type: "response.askedBeforeTool";
};

export type EvalExpectation =
	| ApiBodyExcludesExpectation
	| ApiBodyNumberFieldsExpectation
	| ApiCalledAfterApprovalExpectation
	| ApiCalledExpectation
	| ApiCalledInOrderExpectation
	| ResponseAskedExpectation
	| ResponseAskedBeforeToolExpectation
	| ResponseConciseExpectation
	| ResponseMentionsExpectation
	| ToolsCalledExpectation;

export type EvalExpected =
	| LegacyEvalExpected
	| (EvalExpectation[] & LegacyEvalExpected);
