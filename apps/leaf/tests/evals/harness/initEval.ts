import { Eval } from "braintrust";
import type { AutumnMcpAuth } from "../../../../../packages/mcp/src/server/auth/auth.js";
import type { EvalSetup } from "../fixtures/types.js";
import {
	type EvalExpected,
	type EvalScorer,
	scoresFromExpectations,
} from "../utils/scorers.js";
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

export const initEval = <Metadata extends EvalCaseMetadata>({
	auth,
	autumnApiOverrides,
	cases,
	driver,
	experimentName,
	metadata,
	scores,
	setup,
	timeout = 45_000,
	today,
	trace,
}: InitEvalOptions<Metadata>) => {
	const resolvedDriver = driver ?? createLeafAgentDriver();
	// Default panel: one named scorer per expectation type the cases declare,
	// so Braintrust only shows columns a case can actually fail.
	const resolvedScores =
		scores ?? scoresFromExpectations(cases.map((testCase) => testCase.expect));
	return Eval<InitEvalInput, EvalRunResult, EvalExpected, EvalCaseMetadata>(
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
			// The Autumn API mock intercepts global fetch per eval context, so
			// concurrent cases corrupt each other's routing (one case's cleanup
			// restores fetch mid-flight for the other). Run cases sequentially.
			maxConcurrency: 1,
			scores: resolvedScores,
			task: async (input) => {
				const context = await createEvalContext({
					auth,
					autumnApiOverrides,
					driver: resolvedDriver,
					name: experimentName,
					setup,
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
};
