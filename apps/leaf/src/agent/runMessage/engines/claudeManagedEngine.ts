import Anthropic from "@anthropic-ai/sdk";
import type { AutumnLogger } from "@autumn/logging";
import { type Span, traced } from "braintrust";
import { claudeManagedConfig } from "../../../harness/claudeManaged/config.js";
import { ensureLeafResources } from "../../../harness/claudeManaged/ensureLeafResources.js";
import { ensureMemoryStore } from "../../../harness/claudeManaged/memory/ensureMemoryStore.js";
import { cmaRepo } from "../../../harness/claudeManaged/repos/claudeManagedRepo.js";
import { driveSessionTurn } from "../../../harness/claudeManaged/session/driveSessionTurn.js";
import { buildUserMessageContent } from "../../../harness/claudeManaged/session/userMessage.js";
import { ensureAutumnVault } from "../../../harness/claudeManaged/vaults/ensureAutumnVault.js";
import { containsSecret } from "../../../internal/sandbox/tool/guardrails.js";
import { db } from "../../../lib/db.js";
import { createBraintrustLogger } from "../../../providers/braintrust/index.js";
import { formatToolAction } from "../../tools/autumnMcp.js";
import {
	createPreviewCapture,
	type PreviewApproval,
} from "../../tools/toolPolicy.js";
import type { AgentEngine, MessageContext, MessageParams } from "../types.js";

const client = new Anthropic();
// initLogger sets Braintrust's ambient logger so traced()/spans are recorded.
const braintrustLogger = createBraintrustLogger();
const braintrustEnabled = Boolean(braintrustLogger);

// Defense in depth: the Autumn token is injected by Anthropic's vault proxy and
// never enters the sandbox, so this should never fire — but redact if it does.
const redactSecrets = ({
	logger,
	text,
}: {
	logger: AutumnLogger;
	text: string;
}) => {
	if (!text || !containsSecret(text)) return text;
	logger.error("Redacted suspected secret in agent output", {
		event: "leaf.claude_managed_output_redacted",
	});
	return "[response withheld: it appeared to contain a credential]";
};

// The agent's system prompt is env/thread-agnostic (one shared agent), so a new
// session's first message carries the env + recent thread context.
const buildMessageText = ({
	env,
	newSession,
	params,
}: {
	env: string;
	newSession: boolean;
	params: MessageParams;
}) => {
	if (!newSession) return params.text;
	const preamble = [
		`Current Autumn environment: ${env}.`,
		params.recentMessages?.length
			? `Recent thread messages:\n${params.recentMessages
					.map(
						(m) => `${m.author}${m.isBot === true ? " (bot)" : ""}: ${m.text}`,
					)
					.join("\n")}`
			: null,
	]
		.filter((section): section is string => Boolean(section))
		.join("\n\n");
	return preamble ? `${preamble}\n\n${params.text}` : params.text;
};

export const claudeManagedEngine: AgentEngine = {
	name: "claude-managed",
	run: async ({ ctx, params }) => {
		const { env, logger, onAction, org, thread, token } = ctx;

		const threadKey = [
			thread.provider,
			thread.workspaceId,
			thread.channelId,
			thread.threadId,
			env,
		].join(":");

		// Shared agent/env (auto-ensured once) + per-tenant vault (auto, lazy).
		const { agentId, environmentId } = await ensureLeafResources({
			client,
			env,
			logger,
			token,
		});
		const vaultId = await ensureAutumnVault({
			client,
			env,
			orgId: org.id,
			provider: thread.provider,
			workspaceId: thread.workspaceId,
		});
		// Per-org memory store → cross-thread memory (attached at session create only).
		const memoryStoreId = await ensureMemoryStore({
			client,
			env,
			orgId: org.id,
		});

		const existingSession = await cmaRepo.getSession({
			db,
			env,
			orgId: org.id,
			threadKey,
		});
		let sessionId = existingSession?.sessionId;
		// Braintrust root span for this Slack thread (set on the first turn); later
		// turns pass it as `parent` so all turns roll into one Braintrust thread.
		const braintrustParent = existingSession?.braintrustParent;
		const newSession = !sessionId;
		if (!sessionId) {
			const session = await client.beta.sessions.create({
				agent: agentId,
				environment_id: environmentId,
				metadata: { env, orgId: org.id, threadKey },
				resources: [
					{
						access: "read_write",
						instructions:
							"Org context across threads — read it before acting; save durable facts (customers, preferences, decisions) so future threads recall them.",
						memory_store_id: memoryStoreId,
						type: "memory_store",
					},
				],
				title: `${thread.provider}:${thread.threadId}`,
				vault_ids: [vaultId],
			});
			sessionId = session.id;
			await cmaRepo.upsertSession({
				db,
				env,
				orgId: org.id,
				sessionId,
				threadKey,
			});
		}
		const activeSessionId = sessionId;

		logger.info("Starting Claude Managed agent", {
			event: "leaf.agent_started",
			context: { env, org_id: org.id, provider: thread.provider },
			data: {
				agent_run_id: ctx.id,
				resumed: !newSession,
				session_id: activeSessionId,
				thread_id: thread.threadId,
			},
		});

		const previewCapture = createPreviewCapture();
		const text = buildMessageText({ env, newSession, params });

		const runTurn = ({ span }: { span?: Span }) => {
			const openToolSpans = new Map<string, Span>();
			return driveSessionTurn({
				autumnMcpServerName: claudeManagedConfig.autumnMcpServerName,
				client,
				kickoff: () =>
					client.beta.sessions.events.send(activeSessionId, {
						events: [
							{
								content: buildUserMessageContent({
									attachments: params.attachments,
									text,
								}),
								type: "user.message",
							},
						],
					}),
				onAutumnTool: async ({ id, input, name }) => {
					logger.info("Calling Autumn MCP tool", {
						event: "leaf.mcp_tool_called",
						tool: name,
					});
					await onAction?.(formatToolAction({ args: input, toolName: name }));
					previewCapture.onToolCall({ input, name });
					if (span) {
						openToolSpans.set(
							id,
							span.startSpan({ event: { input }, name, type: "tool" }),
						);
					}
				},
				onAutumnToolResult: ({ id, name, output }) => {
					previewCapture.onToolResult({ name, output });
					const toolSpan = openToolSpans.get(id);
					if (toolSpan) {
						toolSpan.log({ output });
						toolSpan.end();
						openToolSpans.delete(id);
					}
				},
				sessionId: activeSessionId,
			});
		};

		// One parent span per turn; child spans per Autumn tool; token usage as
		// metrics. session_id + thread_id metadata link a thread's turns together.
		const outcome = braintrustEnabled
			? await traced(
					async (span) => {
						if (!braintrustParent) {
							await cmaRepo.setBraintrustParent({
								db,
								env,
								orgId: org.id,
								parent: await span.export(),
								threadKey,
							});
						}
						span.log({
							input: params.text,
							metadata: {
								agent_run_id: ctx.id,
								env,
								org_id: org.id,
								provider: thread.provider,
								resumed: !newSession,
								session_id: activeSessionId,
								thread_id: thread.threadId,
							},
						});
						const result = await runTurn({ span });
						const turnText = result.textParts.join("\n\n");
						// Braintrust's Thread view only renders `llm` spans whose input is a
						// message array — the parent task + tool spans don't. Emit one so the
						// conversation (recent thread context + this turn) shows up there.
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
								finish_reason: result.suspended ? "suspended" : "stop",
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
						name: "leaf-claude-managed-message",
						parent: braintrustParent,
						type: "task",
					},
				)
			: await runTurn({});

		const finalText = redactSecrets({
			logger,
			text: outcome.textParts.join("\n\n"),
		});
		if (outcome.errorMessage && !finalText && !outcome.suspended) {
			throw new Error(`Claude Managed agent failed: ${outcome.errorMessage}`);
		}

		logger.info("Completed Claude Managed agent", {
			event: "leaf.agent_completed",
			context: { env },
			data: {
				cost_tokens: outcome.usage.inputTokens + outcome.usage.outputTokens,
				finish_reason: outcome.suspended ? "suspended" : "stop",
				resumed: !newSession,
				run_id: activeSessionId,
			},
		});

		return {
			env,
			finishReason: outcome.suspended ? "suspended" : "stop",
			previewApproval: previewCapture.captured as PreviewApproval | undefined,
			runId: activeSessionId,
			suspendPayload: outcome.suspended
				? {
						args: outcome.suspended.args,
						toolCallId: outcome.suspended.toolCallId,
						toolName: outcome.suspended.toolName,
					}
				: undefined,
			text: finalText,
		};
	},
};
