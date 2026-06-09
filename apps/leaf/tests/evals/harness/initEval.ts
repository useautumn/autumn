import { Eval } from "braintrust";
import type { AutumnMcpAuth } from "../../../../../packages/mcp/src/server/auth/auth.js";
import type { EvalSetup } from "../fixtures/types.js";
import {
	standardEvalScores,
	type EvalExpected,
	type EvalScorer,
} from "../utils/scorers.js";
import {
	createEvalContext,
	type EvalRunResult,
	type EvalTurn,
} from "./createEvalContext.js";
import type { AutumnApiMockOverrides } from "./context/types.js";
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
	maxSteps,
	message,
}: {
	maxSteps?: number;
	message: string;
}): EvalTurn => ({
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
	driver = createLeafAgentDriver(),
	experimentName,
	metadata,
	scores = standardEvalScores(),
	setup,
	timeout = 45_000,
	today,
	trace,
}: InitEvalOptions<Metadata>) =>
	Eval<InitEvalInput, EvalRunResult, EvalExpected, EvalCaseMetadata>(
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
					setup: setup.tag,
				},
			})),
			scores,
			task: async (input) => {
				const context = await createEvalContext({
					auth,
					autumnApiOverrides,
					driver,
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
