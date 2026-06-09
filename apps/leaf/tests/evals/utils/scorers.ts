import type {
	AutumnApiCall,
	AutumnEvalToolName,
} from "../harness/context/types.js";

export type EvalOutput = {
	apiCalls: AutumnApiCall[];
	finalText: string;
	toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
};

export type EvalExpected = {
	apiCalls?: Array<{
		body?: Record<string, unknown>;
		toolName: AutumnEvalToolName;
	}>;
	finalTextIncludes?: string[];
	toolCalls?: AutumnEvalToolName[];
};

const includesObject = (
	actual: Record<string, unknown>,
	expected: Record<string, unknown>,
) =>
	Object.entries(expected).every(([key, value]) =>
		typeof value === "object" && value !== null
			? JSON.stringify(actual[key]) === JSON.stringify(value)
			: actual[key] === value,
	);

export const expectedApiCalls = ({
	expected,
	output,
}: {
	expected?: EvalExpected;
	output: EvalOutput;
}) => {
	const expectedCalls = expected?.apiCalls ?? [];
	if (!expectedCalls.length) return 1;
	return expectedCalls.every((expectedCall) =>
		output.apiCalls.some(
			(call) =>
				call.toolName === expectedCall.toolName &&
				(!expectedCall.body || includesObject(call.body, expectedCall.body)),
		),
	)
		? 1
		: 0;
};

export const expectedToolCalls = ({
	expected,
	output,
}: {
	expected?: EvalExpected;
	output: EvalOutput;
}) => {
	const expectedTools = expected?.toolCalls ?? [];
	if (!expectedTools.length) return 1;
	return expectedTools.every((toolName) =>
		output.toolCalls.some((call) => call.name === toolName),
	)
		? 1
		: 0;
};

export const finalTextIncludes = ({
	expected,
	output,
}: {
	expected?: EvalExpected;
	output: EvalOutput;
}) => {
	const phrases = expected?.finalTextIncludes ?? [];
	if (!phrases.length) return 1;
	const text = output.finalText.toLowerCase();
	return phrases.every((phrase) => text.includes(phrase.toLowerCase())) ? 1 : 0;
};

export const noAttachBeforePreview = ({ output }: { output: EvalOutput }) => {
	const attachIndex = output.apiCalls.findIndex(
		(call) => call.toolName === "attach",
	);
	const previewIndex = output.apiCalls.findIndex(
		(call) => call.toolName === "previewAttach",
	);
	return attachIndex === -1 ||
		(previewIndex !== -1 && previewIndex < attachIndex)
		? 1
		: 0;
};
