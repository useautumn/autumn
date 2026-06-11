import type {
	EvalExpectation,
	EvalExpected,
	ExpectedApiCall,
	LegacyEvalExpected,
} from "../fixtures/expectations/types.js";
import type { AutumnApiCall } from "../harness/context/types.js";

export type {
	EvalExpectation,
	EvalExpected,
	ExpectedApiCall,
	LegacyEvalExpected,
} from "../fixtures/expectations/types.js";

export type EvalOutput = {
	apiCalls: AutumnApiCall[];
	finalText: string;
	toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
	turns?: Array<{
		apiCalls?: AutumnApiCall[];
		text?: string;
		toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
		type: "approve" | "user";
	}>;
};

export type EvalScoreArgs = {
	expected?: EvalExpected;
	output: EvalOutput;
};

export type EvalScorer = (args: EvalScoreArgs) => {
	name: string;
	score: number;
};

const namedScorer = ({
	name,
	score,
}: {
	name: string;
	score: (args: EvalScoreArgs) => number;
}): EvalScorer => {
	const scorer: EvalScorer = (args) => ({ name, score: score(args) });
	Object.defineProperty(scorer, "name", { value: name });
	return scorer;
};

const includesValue = ({
	actual,
	expected,
}: {
	actual: unknown;
	expected: unknown;
}): boolean => {
	if (Array.isArray(expected)) {
		return (
			Array.isArray(actual) &&
			expected.length === actual.length &&
			expected.every((value, index) =>
				includesValue({ actual: actual[index], expected: value }),
			)
		);
	}
	if (expected && typeof expected === "object") {
		return (
			actual !== null &&
			typeof actual === "object" &&
			Object.entries(expected).every(([key, value]) =>
				includesValue({
					actual: (actual as Record<string, unknown>)[key],
					expected: value,
				}),
			)
		);
	}
	return actual === expected;
};

const includesObject = (
	actual: Record<string, unknown>,
	expected: Record<string, unknown>,
) => includesValue({ actual, expected });

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

const getExpectedApiCallsAfterApproval = (expected?: EvalExpected) =>
	getExpectationList(expected).flatMap((expectation) =>
		expectation.type === "api.calledAfterApproval" ? [expectation.call] : [],
	);

const getExpectedApiBodyExclusions = (expected?: EvalExpected) =>
	getExpectationList(expected).flatMap((expectation) =>
		expectation.type === "api.bodyExcludes" ? [expectation] : [],
	);

const getExpectedApiBodyNumberFields = (expected?: EvalExpected) =>
	getExpectationList(expected).flatMap((expectation) =>
		expectation.type === "api.bodyNumberFields" ? [expectation] : [],
	);

const getExpectedResponsePhrases = (expected?: EvalExpected) => [
	...(getLegacyExpected(expected)?.finalTextIncludes ?? []),
	...getExpectationList(expected).flatMap((expectation) =>
		expectation.type === "response.mentions" ? expectation.phrases : [],
	),
];

const getExpectedQuestions = (expected?: EvalExpected) =>
	getExpectationList(expected).flatMap((expectation) =>
		expectation.type === "response.asked" ? [expectation] : [],
	);

const getExpectedQuestionsBeforeTool = (expected?: EvalExpected) =>
	getExpectationList(expected).flatMap((expectation) =>
		expectation.type === "response.askedBeforeTool" ? [expectation] : [],
	);

const normalizeText = (value: string) =>
	value.toLowerCase().replace(/[_-]/g, " ");

const textMatches = ({
	notPhrases = [],
	phrases,
	text,
}: {
	phrases: string[];
	text: string;
	notPhrases?: string[];
}) => {
	const normalizedText = normalizeText(text);
	return (
		phrases.every((phrase) => normalizedText.includes(normalizeText(phrase))) &&
		notPhrases.every(
			(phrase) => !normalizedText.includes(normalizeText(phrase)),
		)
	);
};

const matchesApiCall = ({
	actual,
	expected,
}: {
	actual: AutumnApiCall;
	expected: ExpectedApiCall;
}) =>
	actual.toolName === expected.toolName &&
	(!expected.body || includesObject(actual.body, expected.body));

const valuesAtPath = ({
	path,
	value,
}: {
	path: string;
	value: unknown;
}): unknown[] => {
	const parts = path.split(".");
	const walk = ({
		index,
		current,
	}: {
		index: number;
		current: unknown;
	}): unknown[] => {
		if (index === parts.length) return [current];
		const part = parts[index];
		if (part === "*") {
			return Array.isArray(current)
				? current.flatMap((item) => walk({ current: item, index: index + 1 }))
				: [];
		}
		return current && typeof current === "object"
			? walk({
					current: (current as Record<string, unknown>)[part],
					index: index + 1,
				})
			: [];
	};
	return walk({ current: value, index: 0 });
};

export const expectedApiCalls = ({ expected, output }: EvalScoreArgs) => {
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

export const expectedApiCallsAfterApproval = ({
	expected,
	output,
}: EvalScoreArgs) => {
	const expectedCalls = getExpectedApiCallsAfterApproval(expected);
	if (!expectedCalls.length) return 1;

	const firstApproveIndex =
		output.turns?.findIndex((turn) => turn.type === "approve") ?? -1;
	if (firstApproveIndex === -1) return 0;

	const turnsBeforeApproval = output.turns?.slice(0, firstApproveIndex) ?? [];
	return expectedCalls.every((expectedCall) => {
		const calledBeforeApproval = turnsBeforeApproval.some((turn) =>
			(turn.apiCalls ?? []).some((call) =>
				matchesApiCall({ actual: call, expected: expectedCall }),
			),
		);
		if (calledBeforeApproval) return false;

		return output.apiCalls.some((call) =>
			matchesApiCall({ actual: call, expected: expectedCall }),
		);
	})
		? 1
		: 0;
};

export const expectedToolCalls = ({ expected, output }: EvalScoreArgs) => {
	const expectedTools = getExpectedToolNames(expected);
	if (!expectedTools.length) return 1;
	return expectedTools.every((toolName) =>
		output.toolCalls.some((call) => call.name === toolName),
	)
		? 1
		: 0;
};

export const expectedApiBodyExclusions = ({
	expected,
	output,
}: EvalScoreArgs) => {
	const exclusions = getExpectedApiBodyExclusions(expected);
	if (!exclusions.length) return 1;
	return exclusions.every((exclusion) =>
		output.apiCalls
			.filter((call) => call.toolName === exclusion.toolName)
			.every((call) =>
				exclusion.fields.every((field) => !(field in call.body)),
			),
	)
		? 1
		: 0;
};

export const expectedApiBodyNumberFields = ({
	expected,
	output,
}: EvalScoreArgs) => {
	const expectations = getExpectedApiBodyNumberFields(expected);
	if (!expectations.length) return 1;
	return expectations.every((expectation) => {
		const matchingCalls = output.apiCalls.filter(
			(call) => call.toolName === expectation.toolName,
		);
		return (
			matchingCalls.length > 0 &&
			matchingCalls.every((call) =>
				expectation.paths.every((path) => {
					const values = valuesAtPath({ path, value: call.body });
					return (
						values.length > 0 &&
						values.every((value: unknown) => typeof value === "number")
					);
				}),
			)
		);
	})
		? 1
		: 0;
};

export const finalTextIncludes = ({ expected, output }: EvalScoreArgs) => {
	const phrases = getExpectedResponsePhrases(expected);
	if (!phrases.length) return 1;
	const text = output.finalText.toLowerCase();
	return phrases.every((phrase) => text.includes(phrase.toLowerCase())) ? 1 : 0;
};

export const askedClarification = ({ expected, output }: EvalScoreArgs) => {
	const questions = getExpectedQuestions(expected);
	if (!questions.length) return 1;
	const turns = output.turns?.filter((turn) => turn.type === "user") ?? [];
	return questions.every((question) =>
		turns.some((turn) =>
			textMatches({
				notPhrases: question.notPhrases,
				phrases: question.phrases,
				text: turn.text ?? "",
			}),
		),
	)
		? 1
		: 0;
};

export const askedClarificationBeforeTool = ({
	expected,
	output,
}: EvalScoreArgs) => {
	const questions = getExpectedQuestionsBeforeTool(expected);
	if (!questions.length) return 1;
	const turns = output.turns?.filter((turn) => turn.type === "user") ?? [];
	return questions.every((question) =>
		turns.some((turn) => {
			const hasAsked = textMatches({
				notPhrases: question.notPhrases,
				phrases: question.phrases,
				text: turn.text ?? "",
			});
			const hasTargetTool =
				turn.toolCalls?.some((call) => call.name === question.toolName) ??
				false;
			return hasAsked && !hasTargetTool;
		}),
	)
		? 1
		: 0;
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
	namedScorer({
		name: "Expected tool calls",
		score: expectedToolCalls,
	}),
	namedScorer({
		name: "Expected API calls",
		score: expectedApiCalls,
	}),
	namedScorer({
		name: "Expected API call order",
		score: expectedApiCallsInOrder,
	}),
	namedScorer({
		name: "Expected API calls after approval",
		score: expectedApiCallsAfterApproval,
	}),
	namedScorer({
		name: "Expected API body exclusions",
		score: expectedApiBodyExclusions,
	}),
	namedScorer({
		name: "Expected API body number fields",
		score: expectedApiBodyNumberFields,
	}),
	namedScorer({
		name: "Final text includes",
		score: finalTextIncludes,
	}),
	namedScorer({
		name: "Asked clarification",
		score: askedClarification,
	}),
	namedScorer({
		name: "Asked clarification before tool",
		score: askedClarificationBeforeTool,
	}),
];

export const billingAttachScores = (): EvalScorer[] => standardEvalScores();

export const billingScheduleScores = (): EvalScorer[] => [
	...standardEvalScores(),
	namedScorer({
		name: "Preview before create schedule",
		score: noCreateScheduleBeforePreview,
	}),
];
