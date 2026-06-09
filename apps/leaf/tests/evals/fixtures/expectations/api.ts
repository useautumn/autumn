import type {
	ApiBodyExcludesExpectation,
	ApiBodyNumberFieldsExpectation,
	ApiCalledAfterApprovalExpectation,
	ApiCalledExpectation,
	ApiCalledInOrderExpectation,
	ExpectedApiCall,
} from "./types.js";

export const api = {
	call: ({
		body,
		toolName,
	}: {
		body?: Record<string, unknown>;
		toolName: ExpectedApiCall["toolName"];
	}): ExpectedApiCall => ({
		...(body ? { body } : {}),
		toolName,
	}),
	called: ({
		calls,
	}: {
		calls: ExpectedApiCall[];
	}): ApiCalledExpectation => ({
		calls,
		type: "api.called",
	}),
	calledInOrder: ({
		calls,
	}: {
		calls: ExpectedApiCall[];
	}): ApiCalledInOrderExpectation => ({
		calls,
		type: "api.calledInOrder",
	}),
	calledAfterApproval: ({
		call,
	}: {
		call: ExpectedApiCall;
	}): ApiCalledAfterApprovalExpectation => ({
		call,
		type: "api.calledAfterApproval",
	}),
	bodyExcludes: ({
		fields,
		toolName,
	}: {
		fields: string[];
		toolName: ExpectedApiCall["toolName"];
	}): ApiBodyExcludesExpectation => ({
		fields,
		toolName,
		type: "api.bodyExcludes",
	}),
	bodyNumberFields: ({
		paths,
		toolName,
	}: {
		paths: string[];
		toolName: ExpectedApiCall["toolName"];
	}): ApiBodyNumberFieldsExpectation => ({
		paths,
		toolName,
		type: "api.bodyNumberFields",
	}),
};
