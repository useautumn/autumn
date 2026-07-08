import crypto from "node:crypto";
import type { ChatProvider } from "@autumn/shared";
import {
	createUIMessageStream,
	createUIMessageStreamResponse,
	type UIMessage,
} from "ai";
import { agentEngines } from "../../agent/runMessage/engines/engines.js";
import type {
	MessageAttachment,
	MessageContext,
} from "../../agent/runMessage/types.js";
import type { LeafUiMessage } from "../../harness/claudeManaged/session/sessionEventsToUiMessages.js";
import { redirectCatalogSuspensionToDecision } from "../../harness/eve/catalogDecision.js";
import { presentWebApproval } from "../../internal/approvals/surfaces/web/present.js";
import {
	ensureWebChatAuth,
	WEB_CHAT_PROVIDER,
} from "../../internal/installations/actions/ensureWebChatAuth.js";
import { getOrgInstallationToken } from "../../internal/installations/actions/getOrgInstallationToken.js";
import { db } from "../../lib/db.js";
import { env as chatEnv } from "../../lib/env.js";
import { logger as rootLogger } from "../../lib/logger.js";
import { parsePreviewPayload } from "../../ui/previewContent.js";
import { resolveDashboardEnv } from "./dashboardEnv.js";
import { generateThreadTitle, persistThreadTitle } from "./threadTitle.js";
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

/**
 * Dashboard chat for durable harnesses: run the agent and emit a native
 * AI SDK stream (text + `data-step` tool activity + `data-approval`) instead of
 * the chat-sdk web adapter's text-only path. Harness session state is persisted
 * separately, so refresh can hydrate from session/approval history.
 */
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
	const harness = chatEnv.WEB_AGENT_HARNESS;
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
				agentTools: { destructiveTools: new Set<string>() },
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
				// Tool errors / transient retries — surface as an error step so the
				// user sees something went wrong mid-turn.
				onActionKeyed: ({ message }) => {
					finishLastStep();
					const now = Date.now();
					writer.write({
						data: {
							finishedAt: now,
							label: message,
							startedAt: now,
							status: "error",
						},
						id: crypto.randomUUID(),
						type: "data-step",
					});
				},
				// The managed-agent API exposes thinking only as a progress ping (no
				// text). Use it to close the last tool step once inference resumes, so
				// it stops showing a running clock while the model reasons.
				onThinking: () => finishLastStep(),
				onReasoning: ({ id, text }) => {
					finishLastStep();
					writer.write({
						data: { text },
						id,
						type: "data-reasoning",
					});
				},
				onTurnComplete: (turnText) => {
					finishLastStep();
					writeText(turnText);
				},
				org: { id: orgId },
				providerUserId: userId,
				thread,
				timestamp: Date.now(),
				token: accessToken,
			};

			let output: Awaited<
				ReturnType<(typeof agentEngines)[typeof harness]["run"]>
			>;
			try {
				output = await agentEngines[harness].run({
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
			// updateCatalog is the chokepoint the model can't skip: if the change
			// needs versioning/variant/migration decisions and none were given,
			// deny the parked call and render the decision card instead.
			if (output.suspension && harness === "eve") {
				const decisionPlan = await redirectCatalogSuspensionToDecision({
					decisionProvided: Boolean(clientContext?.catalogDecision),
					env,
					logger,
					orgId,
					providerUserId: userId,
					runId: output.runId,
					suspension: output.suspension,
					thread,
					token: accessToken,
				});
				if (decisionPlan) {
					writeText(
						"A couple of decisions are needed before this can be applied:",
					);
					writer.write({
						data: { plan: decisionPlan, status: "pending" },
						id: decisionPlan.plan_id,
						type: "data-catalog-decision",
					});
					return;
				}
			}
			// The model stopped after a decision-needing preview (no write call):
			// render the decision card directly. Skip when this very turn carried
			// the user's decision — the model is about to apply it.
			if (output.catalogDecision && !clientContext?.catalogDecision) {
				const plan = output.catalogDecision.plan as { plan_id: string };
				writer.write({
					data: { plan, status: "pending" },
					id: plan.plan_id,
					type: "data-catalog-decision",
				});
			}
			if (output.question) {
				// The prompt as normal prose + a data part with the answer options —
				// richer than output.text's flat "Options: A / B" fallback.
				writeText(output.question.prompt);
				writer.write({
					data: {
						options: output.question.options,
						requestId: output.question.requestId,
						status: "pending",
					},
					id: crypto.randomUUID(),
					type: "data-question",
				});
			} else if (output.text) {
				writeText(output.text);
			}

			if (output.suspension) {
				// presentWebApproval backfills the preview (the agent may write
				// without a preceding preview call), so use its returned preview —
				// not output.suspension.preview, which can be empty.
				const approval = await presentWebApproval({
					channelId: thread.channelId,
					harness,
					logger,
					orgId,
					output,
					provider: WEB_CHAT_PROVIDER as ChatProvider,
					providerUserId: userId,
					token: accessToken,
					workspaceId: orgId,
				});
				if (approval) {
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
				}
			}
		},
		onError: (error) => {
			logger.error("Web chat stream failed", {
				event: "leaf.web_chat_stream_failed",
				data: { error: String(error) },
			});
			return "Something went wrong. Please try again.";
		},
	});

	return withCors(createUIMessageStreamResponse({ stream }), origin);
};
