import type { AutumnApiCall } from "../harness/context/types.js";
import type {
	EvalExpected,
	EvalExpectation,
	ExpectedApiCall,
	LegacyEvalExpected,
} from "../fixtures/expectations/types.js";

export type {
	EvalExpected,
	EvalExpectation,
	ExpectedApiCall,
	LegacyEvalExpected,
} from "../fixtures/expectations/types.js";

export type EvalOutput = {
	apiCalls: AutumnApiCall[];
	finalText: string;
	toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
};

export type EvalScoreArgs = {
	expected?: EvalExpected;
	output: EvalOutput;
};

export type EvalScorer = (args: EvalScoreArgs) => {
	name: string;
	score: number;
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

const isExpectationList = (
	expected?: EvalExpected,
): expected is EvalExpectation[] => Array.isArray(expected);

const getLegacyExpected = (
	expected?: EvalExpected,
): LegacyEvalExpected | undefined =>
	isExpectationList(expected) ? undefined : expected;

const getExpectationList = (expected?: EvalExpected): EvalExpectation[] =>
	isExpectationList(expected) ? expected : [];

const getExpectedToolNames = (expected?: EvalExpected) => [
	...(getLegacyExpected(expected)?.toolCalls ?? []),
	...getExpectationList(expected).flatMap((expectation) =>
		expectation.type === "tools.called" ? expectation.toolNames : [],
	),
];

const getExpectedApiCalls = (expected?: EvalExpected) => [
	...(getLegacyExpected(expected)?.apiCalls ?? []),
	...getExpectationList(expected).flatMap((expectation) =>
		expectation.type === "api.called" ||
		expectation.type === "api.calledInOrder"
			? expectation.calls
			: [],
	),
];

const getExpectedApiCallOrder = (expected?: EvalExpected) =>
	getExpectationList(expected).flatMap((expectation) =>
		expectation.type === "api.calledInOrder" ? [expectation.calls] : [],
	);

const getExpectedResponsePhrases = (expected?: EvalExpected) => [
	...(getLegacyExpected(expected)?.finalTextIncludes ?? []),
	...getExpectationList(expected).flatMap((expectation) =>
		expectation.type === "response.mentions" ? expectation.phrases : [],
	),
];

const matchesApiCall = ({
	actual,
	expected,
}: {
	actual: AutumnApiCall;
	expected: ExpectedApiCall;
}) =>
	actual.toolName === expected.toolName &&
	(!expected.body || includesObject(actual.body, expected.body));

export const expectedApiCalls = ({
	expected,
	output,
}: EvalScoreArgs) => {
	const expectedCalls = getExpectedApiCalls(expected);
	if (!expectedCalls.length) return 1;
	return expectedCalls.every((expectedCall) =>
		output.apiCalls.some((call) =>
			matchesApiCall({ actual: call, expected: expectedCall }),
		),
	)
		? 1
		: 0;
};

export const expectedApiCallsInOrder = ({
	expected,
	output,
}: EvalScoreArgs) => {
	const expectedCallGroups = getExpectedApiCallOrder(expected);
	if (!expectedCallGroups.length) return 1;

	return expectedCallGroups.every((expectedCalls) => {
		let startIndex = 0;
		for (const expectedCall of expectedCalls) {
			const foundIndex = output.apiCalls.findIndex(
				(call, index) =>
					index >= startIndex &&
					matchesApiCall({ actual: call, expected: expectedCall }),
			);
			if (foundIndex === -1) return false;
			startIndex = foundIndex + 1;
		}
		return true;
	})
		? 1
		: 0;
};

export const expectedToolCalls = ({
	expected,
	output,
}: EvalScoreArgs) => {
	const expectedTools = getExpectedToolNames(expected);
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
}: EvalScoreArgs) => {
	const phrases = getExpectedResponsePhrases(expected);
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

export const noCreateScheduleBeforePreview = ({
	output,
}: {
	output: EvalOutput;
}) => {
	const createIndex = output.apiCalls.findIndex(
		(call) => call.toolName === "createSchedule",
	);
	const previewIndex = output.apiCalls.findIndex(
		(call) => call.toolName === "previewCreateSchedule",
	);
	return createIndex === -1 ||
		(previewIndex !== -1 && previewIndex < createIndex)
		? 1
		: 0;
};

export const noScheduleCalls = ({ output }: { output: EvalOutput }) =>
	output.apiCalls.every(
		(call) =>
			call.toolName !== "previewCreateSchedule" &&
			call.toolName !== "createSchedule",
	) &&
	output.toolCalls.every(
		(call) =>
			call.name !== "previewCreateSchedule" && call.name !== "createSchedule",
	)
		? 1
		: 0;

export const standardEvalScores = (): EvalScorer[] => [
	(args) => ({
		name: "Expected tool calls",
		score: expectedToolCalls(args),
	}),
	(args) => ({
		name: "Expected API calls",
		score: expectedApiCalls(args),
	}),
	(args) => ({
		name: "Expected API call order",
		score: expectedApiCallsInOrder(args),
	}),
	(args) => ({
		name: "Final text includes",
		score: finalTextIncludes(args),
	}),
];

export const billingAttachScores = (): EvalScorer[] => standardEvalScores();

export const billingScheduleScores = (): EvalScorer[] => [
	...standardEvalScores(),
	(args) => ({
		name: "Preview before create schedule",
		score: noCreateScheduleBeforePreview(args),
	}),
];
