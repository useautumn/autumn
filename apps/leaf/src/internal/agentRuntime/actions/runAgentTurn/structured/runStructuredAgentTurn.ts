import { createOpenAI } from "@ai-sdk/openai";
import { leafAgentPrompt } from "@autumn/agent-docs/agent";
import { generateText, jsonSchema, Output } from "ai";
import { messageContent } from "../../../../../../../leaf-lab/lib/messageContent.js";
import {
	geminiProposalSchema,
	renderProposalRequestSchemas,
} from "../../../../../../../leaf-lab/lib/operationPlan.js";
import { createSingleExecution } from "../../../../../../../leaf-lab/lib/singleExecution.js";
import { serverToolMetadata } from "../../../../../../agent/lib/autumnToolMetadata.js";
import { executeAutumnMcpTool } from "../../../../autumnMcp/client.js";
import type { AgentTurnResult } from "../../../domain/agentTurn.js";
import type {
	AgentTurnContext,
	AgentTurnParams,
} from "../../../domain/agentTurnContext.js";

/** Structured-executor path: Jev selects context, Flash returns one plan,
 * code verifies and previews it, and Leaf's own approval card executes it. */
export const structuredAgentEnabled = () =>
	process.env.LEAF_STRUCTURED_AGENT === "1";

type Executor = ReturnType<typeof createSingleExecution>;
const executors = new Map<string, Executor>();

const structuredInstructions = [
	leafAgentPrompt("leaf"),
	"All Autumn monetary amounts are in major currency units, never cents. Feature allowances are quantities, not money.",
	"Return only the requested structured output: status proposal with the complete ordered list of remaining requested actions, or status clarify/answer with explanatory message and no actions. Code performs schema validation, preview, verification and separate explicit approvals. Never narrate a completed outcome. Never repeat completed actions or invent missing required terms; ask a specific clarification instead. Keep proposal message empty.",
	"If a requested obligation cannot be represented by the available operation schemas, first return status clarify explaining it and list it in unsupported_obligations; once the user proceeds, propose with unsupported_obligations empty.",
	'When increasing an included allowance, preserve existing paid pricing, reset and rollover terms; rebase finite tier boundaries by newIncluded minus oldIncluded. Each schedule phase supplies exactly one of starts_at or starting_after; use explicit user-written dates verbatim, otherwise starts_at "now" for the first phase.',
].join("\n\n");

const model = () =>
	createOpenAI({
		apiKey: process.env.OPENROUTER_API_KEY,
		baseURL: "https://openrouter.ai/api/v1",
	}).chat(process.env.LEAF_STRUCTURED_MODEL ?? "google/gemini-3.8-flash:nitro");

const executorFor = async (ctx: AgentTurnContext): Promise<Executor> => {
	const key = `${ctx.org.id}:${ctx.thread.threadId}`;
	const existing = executors.get(key);
	if (existing) return existing;
	const metadata = await serverToolMetadata({
		appEnv: ctx.env,
		token: ctx.token,
	});
	let contextMarkdown = "";
	const executor = createSingleExecution({
		metadata,
		read: (call) =>
			executeAutumnMcpTool({
				args: call.args,
				env: ctx.env,
				token: ctx.token,
				toolName: call.name,
			}),
		setContext: (markdown) => {
			contextMarkdown = markdown;
		},
		record: (measurement) => {
			ctx.logger.info("Structured agent event", {
				event: "leaf.structured_agent_event",
				data: { kind: measurement.kind, thread: ctx.thread.threadId },
			});
		},
		onMeasurement: () => {},
		generate: async ({ message, outputSchema }) => {
			try {
				const { output } = await generateText({
					model: model(),
					system: [
						structuredInstructions,
						contextMarkdown,
						renderProposalRequestSchemas(outputSchema),
					]
						.filter(Boolean)
						.join("\n\n"),
					prompt: message,
					output: Output.object({
						schema: jsonSchema<Record<string, unknown>>(
							geminiProposalSchema(outputSchema),
						),
					}),
				});
				return output;
			} catch (error) {
				const failed = error as {
					data?: unknown;
					responseBody?: string;
					statusCode?: number;
				};
				ctx.logger.error("Structured generate failed", error, {
					event: "leaf.structured_generate_failed",
					data: {
						response_body: failed.responseBody,
						status_code: failed.statusCode,
						provider_error: failed.data,
					},
				});
				throw error;
			}
		},
	});
	executors.set(key, executor);
	return executor;
};

const toResult = ({
	executor,
	sessionId,
	text,
}: {
	executor: Executor;
	sessionId: string;
	text: string;
}): AgentTurnResult => {
	const pending = executor.pendingProposal();
	if (!pending) return { kind: "reply", sessionId, text };
	return {
		approval: {
			preview: pending.preview,
			toolArgs: {
				...pending.call.args,
				approval_description: pending.summary,
			},
			toolCallId: `structured-${sessionId}-${Date.now()}`,
			toolName: pending.call.name,
		},
		kind: "approval",
		sessionId,
		text,
	};
};

export const runStructuredAgentTurn = async ({
	ctx,
	params,
}: {
	ctx: AgentTurnContext;
	params: AgentTurnParams;
}): Promise<AgentTurnResult> => {
	const executor = await executorFor(ctx);
	const sessionId = `structured:${ctx.org.id}:${ctx.thread.threadId}`;
	const approvalOutcome = params.clientContext?.approvalOutcome as
		| { writes?: Array<{ result: unknown; status: string }> }
		| undefined;
	if (approvalOutcome && executor.hasPendingApproval()) {
		const applied = approvalOutcome.writes?.find(
			(write) => write.status === "applied",
		);
		if (!applied) {
			executor.discardPending();
			return { kind: "reply", sessionId, text: params.text };
		}
		const { text } = await executor.acknowledgeExecuted(applied.result);
		return toResult({ executor, sessionId, text });
	}
	const attachments = (params.attachments ?? []).map((attachment) => ({
		type: "file" as const,
		mediaType: attachment.mimeType,
		filename: attachment.name,
		data: attachment.data,
	}));
	const message = await messageContent({
		message: attachments.length
			? ({
					role: "user",
					content: [{ type: "text", text: params.text }, ...attachments],
				} as Parameters<typeof messageContent>[0]["message"])
			: params.text,
	});
	const { text } = await executor.send(message);
	return toResult({ executor, sessionId, text });
};
