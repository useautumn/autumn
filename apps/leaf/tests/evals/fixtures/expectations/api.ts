import type {
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
};
