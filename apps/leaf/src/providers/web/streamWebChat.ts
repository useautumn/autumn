import crypto from "node:crypto";
import type { ChatProvider } from "@autumn/shared";
import {
	createUIMessageStream,
	createUIMessageStreamResponse,
	type UIMessage,
} from "ai";
import type {
	MessageAttachment,
	MessageContext,
} from "../../agent/runMessage/types.js";
import { redirectCatalogSuspensionToDecision } from "../../internal/agentRuntime/eve/catalogDecision.js";
import { runEveMessage } from "../../internal/agentRuntime/eve/engine.js";
import { presentWebApproval } from "../../internal/approvals/surfaces/web/present.js";
import {
	ensureWebChatAuth,
	WEB_CHAT_PROVIDER,
} from "../../internal/installations/actions/ensureWebChatAuth.js";
import { getOrgInstallationToken } from "../../internal/installations/actions/getOrgInstallationToken.js";
import { db } from "../../lib/db.js";
import { logger as rootLogger } from "../../lib/logger.js";
import {
	CATALOG_DECISION_NEEDED_MESSAGE,
	GENERIC_FAILURE_MESSAGE,
	NO_REPLY_MESSAGE,
} from "../../ui/messages.js";
import { parsePreviewPayload } from "../../ui/previewContent.js";
import { resolveDashboardEnv } from "./dashboardEnv.js";
import { generateThreadTitle, persistThreadTitle } from "./threadTitle.js";
import type { LeafUiMessage } from "./types.js";
import { buildWebChatThreadId, webThreadRef } from "./webThread.js";

const DATA_URL_REGEX = /^data:([^;]+);base64,(.*)$/s;

const dataUrlToAttachment = (
	url: string,
	name?: string,
): MessageAttachment | null => {
	const match = DATA_URL_REGEX.exec(url);
	return match
		? { data: Buffer.from(match[2], "base64"), mimeType: match[1], name }
		: null;
};

const parseRequest = (body: { id?: string; messages?: UIMessage[] }) => {
	const userMessages = (body.messages ?? []).filter(
		(message) => message.role === "user",
	);
	const lastUser = userMessages.at(-1);
	const parts = lastUser?.parts ?? [];
	const text = parts
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join("");
	const attachments = parts.flatMap((part) =>
		part.type === "file" && part.url
			? ([dataUrlToAttachment(part.url, part.filename)].filter(
					Boolean,
				) as MessageAttachment[])
			: [],
	);
	// Structured, one-turn-only context (e.g. a submitted CatalogDecisionCard
	// choice or a clicked question chip), sent as AI SDK message `metadata`
	// alongside the readable text.
	const metadata = lastUser?.metadata as
		| {
				catalogDecision?: Record<string, unknown>;
				questionResponse?: { optionId: string; requestId: string };
		  }
		| undefined;
	const clientContext = metadata?.catalogDecision
		? { catalogDecision: metadata.catalogDecision }
		: undefined;
	return {
		attachments,
		clientContext,
		conversationId: body.id,
		isFirstUserMessage: userMessages.length <= 1,
		questionResponse: metadata?.questionResponse,
		text,
	};
};

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
	auth: { orgId: string; userId: string; scopes: string[] };
	origin?: string;
	request: Request;
}): Promise<Response> => {
	const body = (await request.json()) as {
		id?: string;
		messages?: UIMessage[];
	};
	const {
		attachments,
		clientContext,
		conversationId,
		isFirstUserMessage,
		questionResponse,
		text,
	} = parseRequest(body);
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

	// Title the thread off its opening message, in parallel with the run — the
	// session row it lands on is upserted by the engine during the run.
	const titlePromise =
		isFirstUserMessage && text.trim()
			? generateThreadTitle({ logger, text })
			: undefined;

	const stream = createUIMessageStream<LeafUiMessage>({
		execute: async ({ writer }) => {
			await ensureWebChatAuth({ orgId, userId, userScopes: scopes });
			const { accessToken } = await getOrgInstallationToken({
				env,
				orgId,
				provider: WEB_CHAT_PROVIDER as ChatProvider,
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

			const ctx: MessageContext = {
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

			let output: Awaited<ReturnType<typeof runEveMessage>>;
			try {
				output = await runEveMessage({
					ctx,
					params: { attachments, clientContext, questionResponse, text },
				});
			} finally {
				// Fire-and-forget so a failed run still labels the thread (the
				// session row is upserted early in the run) and teardown stays fast.
				if (titlePromise) {
					void persistThreadTitle({
						db,
						env,
						logger,
						orgId,
						thread,
						titlePromise,
					});
				}
			}

			finishLastStep();
			if (output.kind === "approval") {
				const decisionPlan = await redirectCatalogSuspensionToDecision({
					decisionProvided: Boolean(clientContext?.catalogDecision),
					env,
					logger,
					orgId,
					providerUserId: userId,
					runId: output.sessionId,
					suspension: output.approval,
					thread,
					token: accessToken,
				});
				if (decisionPlan) {
					writeText(CATALOG_DECISION_NEEDED_MESSAGE);
					writer.write({
						data: { plan: decisionPlan, status: "pending" },
						id: decisionPlan.plan_id,
						type: "data-catalog-decision",
					});
					return;
				}
				if (output.text) writeText(output.text);
				const approval = await presentWebApproval({
					channelId: thread.channelId,
					env,
					logger,
					orgId,
					provider: WEB_CHAT_PROVIDER as ChatProvider,
					providerUserId: userId,
					token: accessToken,
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
				if (!clientContext?.catalogDecision) {
					writer.write({
						data: { plan: output.plan, status: "pending" },
						id: output.plan.plan_id,
						type: "data-catalog-decision",
					});
				}
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
