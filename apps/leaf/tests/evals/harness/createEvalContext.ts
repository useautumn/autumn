import type { AutumnMcpAuth } from "../../../../../packages/mcp/src/server/auth/auth.js";
import type { EvalSetup } from "../fixtures/types.js";
import { createEvalRuntimeContext } from "./context/createEvalRuntimeContext.js";
import type {
	AutumnApiMockOverrides,
	EvalRuntimeContext,
} from "./context/types.js";
import type { EvalAgentDriver } from "./drivers/types.js";
import { createEvalTrace } from "./tracing/createEvalTrace.js";
import type { EvalTrace, EvalTraceLevel } from "./tracing/types.js";

export type EvalTurn =
	| { maxSteps?: number; message: string; type: "user" }
	| { maxSteps?: number; optional?: boolean; type: "approve" };

export type EvalTurnResult = {
	text?: string;
	type: EvalTurn["type"];
};

export type EvalRunResult = {
	apiCalls: EvalRuntimeContext["autumnApi"]["calls"];
	finalText: string;
	toolCalls: ReturnType<
		Awaited<ReturnType<EvalAgentDriver["start"]>>["getToolCalls"]
	>;
	turns: EvalTurnResult[];
};

export const createEvalContext = async ({
	auth,
	autumnApiOverrides,
	driver,
	name,
	setup,
	today,
	trace: traceConfig = {},
}: {
	auth?: Partial<AutumnMcpAuth>;
	autumnApiOverrides?: AutumnApiMockOverrides;
	driver: EvalAgentDriver;
	name?: string;
	setup: EvalSetup;
	today?: Date;
	trace?: { level?: EvalTraceLevel };
}) => {
	const trace: EvalTrace = createEvalTrace(traceConfig);
	trace.event({ name, type: "eval_started" });
	const runtimeContext = await createEvalRuntimeContext({
		auth,
		autumnApiOverrides,
		setup,
		trace,
	});
	const runningDriver = await driver.start({
		context: runtimeContext,
		name,
		setup,
		today,
		trace,
	});

	const runConversation = async (turns: EvalTurn[]): Promise<EvalRunResult> => {
		const turnResults: EvalTurnResult[] = [];
		for (const turn of turns) {
			if (turn.type === "user") {
				trace.event({ message: turn.message, type: "user_turn" });
				const output = await runningDriver.send(turn.message, {
					maxSteps: turn.maxSteps,
				});
				turnResults.push({ text: output.text, type: turn.type });
				continue;
			}

			if (!runningDriver.hasPendingApproval()) {
				if (turn.optional) {
					turnResults.push({ type: turn.type });
					continue;
				}
				throw new Error("No pending approval to approve.");
			}
			const output = await runningDriver.approve({ maxSteps: turn.maxSteps });
			turnResults.push({ text: output.text, type: turn.type });
		}

		trace.event({ type: "eval_finished" });
		return {
			apiCalls: runtimeContext.autumnApi.calls,
			finalText: turnResults
				.map((turn) => turn.text)
				.filter(Boolean)
				.join("\n"),
			toolCalls: runningDriver.getToolCalls(),
			turns: turnResults,
		};
	};

	return {
		cleanup: async () => {
			await runningDriver.cleanup();
			await runtimeContext.cleanup();
		},
		runConversation,
		runtimeContext,
		trace,
	};
};
