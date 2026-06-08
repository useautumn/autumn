import { api } from "./api.js";
import type {
	ApiCalledInOrderExpectation,
	ExpectedApiCall,
} from "./types.js";

export const billing = {
	previewBeforeWrite: ({
		preview,
		write,
	}: {
		preview: ExpectedApiCall;
		write: ExpectedApiCall;
	}): ApiCalledInOrderExpectation =>
		api.calledInOrder({ calls: [preview, write] }),
};
