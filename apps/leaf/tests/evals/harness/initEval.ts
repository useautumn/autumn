import { defaultErrorScoreHandler, Eval } from "braintrust";
import type { AutumnMcpAuth } from "../../../../../packages/mcp/src/server/auth/auth.js";
import type { EvalSetup } from "../fixtures/types.js";
import {
	type EvalExpected,
	type EvalScorer,
	scoresFromExpectations,
} from "../utils/scorers.js";
import { assertEvalPassed, failEvalRun } from "./assertEvalPassed.js";
import type { AutumnApiMockOverrides } from "./context/types.js";
import {
	createEvalContext,
	type EvalAttachment,
	type EvalRunResult,
	type EvalTurn,
} from "./createEvalContext.js";
import { createLeafAgentDriver } from "./drivers/leafAgent.js";
import type { EvalAgentDriver } from "./drivers/types.js";
import type { EvalTraceLevel } from "./tracing/types.js";

type EvalCaseMetadata = Record<string, unknown>;

type InitEvalCase<Metadata extends EvalCaseMetadata> = {
	conversation: EvalTurn[];
	expect?: EvalExpected;
	metadata?: Partial<Metadata>;
	name?: string;
};

type InitEvalInput = {
	conversation: EvalTurn[];
};

type InitEvalOptions<Metadata extends EvalCaseMetadata> = {
	auth?: Partial<AutumnMcpAuth>;
	autumnApiOverrides?: AutumnApiMockOverrides;
	cases: InitEvalCase<Metadata>[];
	driver?: EvalAgentDriver;
	experimentName: string;
	metadata: Metadata;
	scores?: EvalScorer[];
	setup: EvalSetup;
	timeout?: number;
	today?: Date;
	trace?: { level?: EvalTraceLevel };
};

export const user = ({
	attachments,
	maxSteps,
	message,
}: {
	attachments?: EvalAttachment[];
	maxSteps?: number;
	message: string;
}): EvalTurn => ({
	...(attachments === undefined ? {} : { attachments }),
	...(maxSteps === undefined ? {} : { maxSteps }),
	message,
	type: "user",
});

export const approve = ({
	maxSteps,
	optional = true,
}: {
	maxSteps?: number;
	optional?: boolean;
} = {}): EvalTurn => ({
	...(maxSteps === undefined ? {} : { maxSteps }),
	optional,
	type: "approve",
});

/** `Eval()` rejects as a whole when the evaluator times out; the CI gate
 * must see that as a failure rather than a clean exit. */
const runEval: typeof Eval = async (...args) => {
	try {
		return await Eval(...args);
	} catch (error) {
		failEvalRun({ error, experimentName: args[1].experimentName });
		throw error;
	}
};

export const initEval = async <Metadata extends EvalCaseMetadata>({
	auth,
	autumnApiOverrides,
	cases,
	driver,
	experimentName,
	metadata,
	scores,
	setup,
	timeout = Number(process.env.EVAL_TIMEOUT_MS) || 45_000,
	today,
	trace,
}: InitEvalOptions<Metadata>) => {
	const resolvedDriver = driver ?? createLeafAgentDriver();
	// Default panel: one named scorer per expectation type the cases declare,
	// so Braintrust only shows columns a case can actually fail.
	const resolvedScores =
		scores ?? scoresFromExpectations(cases.map((testCase) => testCase.expect));
	const evaluation = await runEval<
		InitEvalInput,
		EvalRunResult,
		EvalExpected,
		EvalCaseMetadata
	>(
		"leaf",
		{
			experimentName,
			data: cases.map((testCase) => ({
				expected: testCase.expect ?? {},
				input: { conversation: testCase.conversation },
				metadata: {
					...metadata,
					...testCase.metadata,
					...(testCase.name ? { caseName: testCase.name } : {}),
					driver: resolvedDriver.name,
					setup: setup.tag,
				},
			})),
			// A scorer that throws would otherwise vanish from the results; score
			// it 0 so the dashboard and the CI gate both see it.
			errorScoreHandler: defaultErrorScoreHandler,
			// The Autumn API mock intercepts global fetch per eval context, so
			// concurrent cases corrupt each other's routing (one case's cleanup
			// restores fetch mid-flight for the other). Run cases sequentially.
			maxConcurrency: 1,
			scores: resolvedScores,
			task: async (input) => {
				// The mock API mutates setup state (attach adds a subscription,
				// updateCustomer rewrites the email), so each case starts from a
				// fresh copy or earlier cases leak into later ones.
				const context = await createEvalContext({
					auth,
					autumnApiOverrides,
					driver: resolvedDriver,
					name: experimentName,
					setup: structuredClone(setup),
					today,
					trace,
				});
				try {
					return await context.runConversation(input.conversation);
				} finally {
					await context.cleanup();
				}
			},
			timeout,
		},
		{ noSendLogs: !process.env.BRAINTRUST_API_KEY },
	);
	assertEvalPassed({ evaluation, experimentName });
	return evaluation;
};
