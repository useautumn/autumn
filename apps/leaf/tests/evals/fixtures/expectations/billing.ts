import { api } from "./api.js";
import type {
	ApiCalledInOrderExpectation,
	EvalExpectation,
	ExpectedApiCall,
} from "./types.js";

const previewToolNames = {
	attach: "previewAttach",
	createSchedule: "previewCreateSchedule",
	setPlans: "previewSetPlans",
} as const;

export const billing = {
	previewBeforeWrite: ({
		preview,
		write,
	}: {
		preview: ExpectedApiCall;
		write: ExpectedApiCall;
	}): ApiCalledInOrderExpectation =>
		api.calledInOrder({ calls: [preview, write] }),
	previewThenWrite: ({
		body,
		numberFields,
		write,
	}: {
		body: Record<string, unknown>;
		numberFields?: string[];
		write: keyof typeof previewToolNames;
	}): EvalExpectation[] => {
		const preview = previewToolNames[write];
		return [
			api.calledInOrder({
				calls: [
					{ body, toolName: preview },
					{ body, toolName: write },
				],
			}),
			api.calledAfterApproval({ call: { body, toolName: write } }),
			...(numberFields
				? [
						api.bodyNumberFields({ paths: numberFields, toolName: preview }),
						api.bodyNumberFields({ paths: numberFields, toolName: write }),
					]
				: []),
		];
	},
};
