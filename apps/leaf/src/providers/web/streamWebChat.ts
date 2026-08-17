import crypto from "node:crypto";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { resolveAgentCatalogDecision } from "../../internal/agentRuntime/actions/resolveCatalogDecision/resolveAgentCatalogDecision.js";
import { runAgentTurn } from "../../internal/agentRuntime/actions/runAgentTurn/runAgentTurn.js";
import type { AgentTurnContext } from "../../internal/agentRuntime/domain/agentTurnContext.js";
import { createApproval } from "../../internal/approvals/actions/createApproval.js";
import {
	ensureWebChatAuth,
	WEB_CHAT_PROVIDER,
} from "../../internal/installations/actions/ensureWebChatAuth.js";
import { getOrgInstallationToken } from "../../internal/installations/actions/getOrgInstallationToken.js";
import { logger as rootLogger } from "../../lib/logger.js";
import {
	CATALOG_DECISION_NEEDED_MESSAGE,
	GENERIC_FAILURE_MESSAGE,
	NO_REPLY_MESSAGE,
} from "../../ui/messages.js";
import { parsePreviewPayload } from "../../ui/previewContent.js";
import type { DashboardAuth } from "./authDashboard.js";
import { resolveDashboardEnv } from "./dashboardEnv.js";
import { parseWebChatRequest } from "./parseWebChatRequest.js";
import type { LeafUiMessage } from "./types.js";
import { buildWebChatThreadId, webThreadRef } from "./webThread.js";

const withCors = (response: Response, origin?: string) => {
	if (!origin) return response;
	const headers = new Headers(response.headers);
	headers.set("Access-Control-Allow-Origin", origin);
	headers.set("Access-Control-Allow-Credentials", "true");
	headers.set("Vary", "Origin");
	return new Response(response.body, {
		headers,
		status: response.status,
		statusText: response.statusText,
	});
};

/** Runs Eve and emits the dashboard's native AI SDK stream. */
export const streamWebChat = async ({
	auth,
	origin,
	request,
}: {
	auth: DashboardAuth;
	origin?: string;
	request: Request;
}): Promise<Response> => {
	const body = (await request.json()) as Parameters<
		typeof parseWebChatRequest
	>[0];
	const {
		attachments,
		clientContext,
		conversationId,
		isFirstUserMessage,
		questionResponse,
		text,
	} = parseWebChatRequest(body);
	if (!conversationId) {
		return new Response("Missing conversation id", { status: 400 });
	}

	const { orgId, userId, scopes } = auth;
	// Scope the session + vault + OAuth credential to the dashboard's active env,
	// forwarded as the `app_env` header (server chat proxy passes it through).
	const env = resolveDashboardEnv(request.headers.get("app_env"));
	const logger = rootLogger;
	const chatThreadId = buildWebChatThreadId({ conversationId, orgId, userId });
	const thread = webThreadRef({ chatThreadId, orgId });

	const stream = createUIMessageStream<LeafUiMessage>({
		execute: async ({ writer }) => {
			await ensureWebChatAuth({ orgId, userId, userScopes: scopes });
			const { accessToken } = await getOrgInstallationToken({
				env,
				orgId,
				provider: WEB_CHAT_PROVIDER,
				workspaceId: orgId,
				userId,
			});

			let lastStep:
				| { id: string; label: string; startedAt: number }
				| undefined;
			const finishLastStep = () => {
				if (!lastStep) return;
				const finishedAt = Date.now();
				writer.write({
					data: {
						finishedAt,
						label: lastStep.label,
						startedAt: lastStep.startedAt,
						status: "done",
					},
					id: lastStep.id,
					type: "data-step",
				});
				lastStep = undefined;
			};
			const writeText = (value: string) => {
				if (!value.trim()) return;
				const id = crypto.randomUUID();
				writer.write({ id, type: "text-start" });
				writer.write({ delta: value, id, type: "text-delta" });
				writer.write({ id, type: "text-end" });
			};

			const ctx: AgentTurnContext = {
				env,
				id: crypto.randomUUID(),
				logger,
				onAction: (label) => {
					finishLastStep();
					const id = crypto.randomUUID();
					const startedAt = Date.now();
					lastStep = { id, label, startedAt };
					writer.write({
						data: { label, startedAt, status: "running" },
						id,
						type: "data-step",
					});
				},
				// Thinking closes the active tool step while the model reasons.
				onThinking: () => finishLastStep(),
				onReasoning: ({ id, text }) => {
					finishLastStep();
					writer.write({
						data: { text },
						id,
						type: "data-reasoning",
					});
				},
				org: { id: orgId },
				providerUserId: userId,
				thread,
				timestamp: Date.now(),
				token: accessToken,
			};

			const output = await runAgentTurn({
				ctx,
				params: { attachments, clientContext, questionResponse, text },
				titleSourceText: isFirstUserMessage ? text : undefined,
			});

			finishLastStep();
			const catalogDecision = await resolveAgentCatalogDecision({
				decisionProvided: Boolean(clientContext?.catalogDecision),
				env,
				getToken: async () => accessToken,
				logger,
				orgId,
				providerUserId: userId,
				thread,
				turn: output,
			});
			if (catalogDecision) {
				if (catalogDecision.source === "approval_redirect") {
					writeText(CATALOG_DECISION_NEEDED_MESSAGE);
				}
				writer.write({
					data: { plan: catalogDecision.plan, status: "pending" },
					id: catalogDecision.plan.plan_id,
					type: "data-catalog-decision",
				});
				if (catalogDecision.source === "turn" && catalogDecision.text) {
					writeText(catalogDecision.text);
				}
				return;
			}

			if (output.kind === "approval") {
				if (output.text) writeText(output.text);
				const approval = await createApproval({
					channelId: thread.channelId,
					env,
					getToken: async () => accessToken,
					logger,
					orgId,
					provider: WEB_CHAT_PROVIDER,
					providerUserId: userId,
					turn: output,
					workspaceId: orgId,
				});
				if (!approval) return;
				writer.write({
					data: {
						approvalId: approval.approvalId,
						params: approval.params,
						preview: parsePreviewPayload(approval.preview),
						status: "pending",
						toolName: approval.toolName,
					},
					id: approval.approvalId,
					type: "data-approval",
				});
				return;
			}

			if (output.kind === "catalog_decision") {
				if (output.text) writeText(output.text);
				return;
			}

			if (output.kind === "question") {
				writeText(output.question.prompt);
				writer.write({
					data: {
						options: [...output.question.options],
						requestId: output.question.requestId,
						status: "pending",
					},
					id: crypto.randomUUID(),
					type: "data-question",
				});
				return;
			}

			if (output.kind === "empty") writeText(NO_REPLY_MESSAGE);
			else if (output.text) writeText(output.text);
		},
		onError: (error) => {
			logger.error("Web chat stream failed", {
				event: "leaf.web_chat_stream_failed",
				data: { error: String(error) },
			});
			return GENERIC_FAILURE_MESSAGE;
		},
	});

	return withCors(createUIMessageStreamResponse({ stream }), origin);
};
