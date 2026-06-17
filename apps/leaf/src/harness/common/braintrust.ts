import type { AppEnv } from "@autumn/shared";
import { type Span, traced } from "braintrust";
import type { MessageParams, ThreadRef } from "../../agent/runMessage/types.js";
import type { SessionTurnOutcome } from "./types.js";

/**
 * Wraps a harness turn in a Braintrust task span. Persistence of the exported
 * parent is harness-specific, so the caller supplies `persistBraintrustParent`.
 */
export const runHarnessTurnWithBraintrust = async ({
	agentRunId,
	braintrustParent,
	env,
	newSession,
	orgId,
	params,
	persistBraintrustParent,
	runTurn,
	sessionId,
	spanName,
	thread,
}: {
	agentRunId: string;
	braintrustParent?: string;
	env: AppEnv;
	newSession: boolean;
	orgId: string;
	params: MessageParams;
	persistBraintrustParent: (parent: string) => Promise<void>;
	runTurn: (input: { span?: Span }) => Promise<SessionTurnOutcome>;
	sessionId: string;
	spanName: string;
	thread: ThreadRef;
}) =>
	await traced(
		async (span) => {
			if (!braintrustParent) {
				await persistBraintrustParent(await span.export());
			}
			span.log({
				input: params.text,
				metadata: {
					agent_run_id: agentRunId,
					env,
					org_id: orgId,
					provider: thread.provider,
					resumed: !newSession,
					session_id: sessionId,
					thread_id: thread.threadId,
				},
			});
			const result = await runTurn({ span });
			const turnText = result.textParts.join("\n\n");
			const conversationSpan = span.startSpan({
				name: "conversation",
				type: "llm",
			});
			conversationSpan.log({
				input: [
					...(params.recentMessages ?? []).map((message) => ({
						content: message.text,
						role: message.isBot === true ? "assistant" : "user",
					})),
					{ content: params.text, role: "user" },
				],
				output: turnText,
			});
			conversationSpan.end();
			span.log({
				metadata: {
					finish_reason: result.suspendedQueue?.length ? "suspended" : "stop",
				},
				metrics: {
					completion_tokens: result.usage.outputTokens,
					prompt_cached_tokens: result.usage.cacheReadInputTokens,
					prompt_tokens: result.usage.inputTokens,
					tokens: result.usage.inputTokens + result.usage.outputTokens,
				},
				output: turnText,
			});
			return result;
		},
		{
			name: spanName,
			parent: braintrustParent,
			type: "task",
		},
	);
