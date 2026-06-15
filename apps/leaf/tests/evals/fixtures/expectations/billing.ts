import { api } from "./api.js";
import type {
	ApiCalledInOrderExpectation,
	EvalExpectation,
	ExpectedApiCall,
} from "./types.js";

const previewToolNames = {
	attach: "previewAttach",
	createSchedule: "previewCreateSchedule",
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
	/**
	 * Standard preview-then-write contract for a billing write: the preview tool
	 * runs first with the same body, the write only fires after approval, and
	 * optional paths (e.g. real-time phase starts) are asserted as numbers on
	 * both calls. Spread into `expect: []`.
	 */
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
