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
	/** 1-based approval to measure against; defaults to the first. */
	approvalIndex?: number;
	call: ExpectedApiCall;
	type: "api.calledAfterApproval";
};

export type ApprovalCountExpectation = {
	count: number;
	type: "approval.count";
};

export type ApiCalledTimesExpectation = {
	call: ExpectedApiCall;
	count: number;
	type: "api.calledTimes";
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
	notPhrases?: string[];
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

/** The plans a scope must be left on once the conversation ends: the
 * customer's own subscriptions and, per entity id, the entity's. Cancelled or
 * expired subscriptions do not count. */
export type StateSubscriptionsExpectation = {
	customer: string[];
	customerId: string;
	entities?: Record<string, string[]>;
	type: "state.subscriptions";
};

export type EvalExpectation =
	| StateSubscriptionsExpectation
	| ApiBodyExcludesExpectation
	| ApiBodyNumberFieldsExpectation
	| ApiCalledAfterApprovalExpectation
	| ApiCalledExpectation
	| ApiCalledInOrderExpectation
	| ApiCalledTimesExpectation
	| ApprovalCountExpectation
	| ResponseAskedExpectation
	| ResponseAskedBeforeToolExpectation
	| ResponseConciseExpectation
	| ResponseMentionsExpectation
	| ToolsCalledExpectation;

export type EvalExpected =
	| LegacyEvalExpected
	| (EvalExpectation[] & LegacyEvalExpected);
