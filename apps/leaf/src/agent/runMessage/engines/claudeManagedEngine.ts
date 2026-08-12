import Anthropic from "@anthropic-ai/sdk";
import { all } from "better-all";
import { ensureLeafResources } from "../../../harness/claudeManaged/ensureLeafResources.js";
import { ensureMemoryStore } from "../../../harness/claudeManaged/memory/ensureMemoryStore.js";
import { cmaRepo } from "../../../harness/claudeManaged/repos/claudeManagedRepo.js";
import {
	type ClaudeManagedSessionRef,
	createClaudeManagedSession,
	getClaudeManagedSession,
} from "../../../harness/claudeManaged/session/ensureSession.js";
import { runClaudeManagedTurn } from "../../../harness/claudeManaged/session/runManagedTurn.js";
import { buildUserMessageContent } from "../../../harness/claudeManaged/session/userMessage.js";
import { ensureAutumnVault } from "../../../harness/claudeManaged/vaults/ensureAutumnVault.js";
import { isMissingSessionApiError } from "../../../harness/common/deadSession.js";
import { buildHarnessMessageText } from "../../../harness/common/messageText.js";
import { runEngineLoop } from "../../../harness/common/runEngineLoop.js";
import { cancelPendingSessionApprovals } from "../../../internal/approvals/actions/cancelPendingSessionApprovals.js";
import { autumnOrgContextService } from "../../../internal/autumnMcp/orgContextService.js";
import { claudeManagedMemoryEnabled } from "../../../lib/chatAgentConfig.js";
import { db } from "../../../lib/db.js";
import { createPhaseTimer } from "../../../lib/perf.js";
import { createBraintrustLogger } from "../../../providers/braintrust/index.js";
import type { AgentOutput } from "../../../types.js";
import type { AgentEngine } from "../types.js";

const client = new Anthropic();

// initLogger sets Braintrust's ambient logger so traced()/spans are recorded.
const braintrustLogger = createBraintrustLogger();
const braintrustEnabled = Boolean(braintrustLogger);

const deadSessionFailure = (error: unknown) =>
	error instanceof Error
		? error
		: new Error("The agent session for this thread could not be resumed.");

type SessionAttempt = {
	deadSessionError?: unknown;
	output?: AgentOutput;
	sessionDead: boolean;
};

export const claudeManagedEngine: AgentEngine = {
	name: "claude-managed",
	run: async ({ ctx, params }) => {
		const {
			autumnUserId,
			env,
			logger,
			onAction,
			onActionKeyed,
			onAgentReady,
			onApprovalsSuperseded,
			onThinking,
			org,
			providerUserId,
			thread,
			token,
			claudeManagedSession,
		} = ctx;

		const perf = createPhaseTimer(logger);
		let orgContext: Awaited<ReturnType<typeof autumnOrgContextService.load>>;

		const startFreshSession = async () => {
			const {
				memoryStoreId,
				orgContext: loadedOrgContext,
				resources: { agentId, environmentId },
				vaultId,
			} = await all({
				async resources() {
					return perf.time("ensure_resources", () =>
						ensureLeafResources({
							client,
							env,
							logger,
							surface: thread.provider === "web" ? "dashboard" : "slack",
							token,
						}),
					);
				},
				async vaultId() {
					return perf.time("ensure_vault", () =>
						ensureAutumnVault({
							client,
							env,
							orgId: org.id,
							provider: thread.provider,
							workspaceId: thread.workspaceId,
							userId: autumnUserId,
						}),
					);
				},
				async memoryStoreId() {
					return claudeManagedMemoryEnabled
						? ensureMemoryStore({ client, env, orgId: org.id })
						: undefined;
				},
				async orgContext() {
					return perf.time("org_context", () =>
						autumnOrgContextService.load({ env, logger, token }),
					);
				},
			});
			orgContext = loadedOrgContext;
			return perf.time("session_create", () =>
				createClaudeManagedSession({
					agentId,
					client,
					db,
					env,
					environmentId,
					memoryStoreId,
					orgId: org.id,
					thread,
					userId: autumnUserId,
					vaultId,
				}),
			);
		};

		const dropSessionRow = async ({ sessionId }: { sessionId: string }) => {
			try {
				await cmaRepo.deleteSessionById({
					db,
					env,
					orgId: org.id,
					sessionId,
				});
			} catch (error) {
				logger.warn("Could not drop the dead session row", {
					event: "leaf.cma_session_drop_failed",
					context: { env, org_id: org.id },
					data: { session_id: sessionId },
					error,
				});
			}
		};

		const runOnSession = async ({
			sessionRef,
		}: {
			sessionRef: ClaudeManagedSessionRef;
		}): Promise<SessionAttempt> => {
			const {
				braintrustParent,
				newSession,
				sessionId: activeSessionId,
				threadKey,
			} = sessionRef;
			ctx.run?.resolveSessionId(activeSessionId);

			if (!newSession) {
				// Re-sync the vault: it's seeded only at session creation, but leaf
				// rotates the shared OAuth refresh token each turn, so a stale vault 401s.
				await ensureAutumnVault({
					client,
					env,
					orgId: org.id,
					provider: thread.provider,
					workspaceId: thread.workspaceId,
					userId: autumnUserId,
				});

				const { cancelledApprovals, cancelledCount } =
					await cancelPendingSessionApprovals({
						client,
						db,
						logger,
						providerUserId,
						query: {
							channelId: thread.channelId,
							env,
							orgId: org.id,
							provider: thread.provider,
							runId: activeSessionId,
							workspaceId: thread.workspaceId,
						},
						sessionId: activeSessionId,
					});
				if (cancelledCount > 0) {
					await onApprovalsSuperseded?.(cancelledApprovals);
				}
			}

			// Startup (resource/session provisioning) is done — release the
			// "Starting Autumn" bootstrap card before the first turn runs.
			await onAgentReady?.();

			const content = buildUserMessageContent({
				attachments: params.attachments,
				text: buildHarnessMessageText({
					env,
					newSession,
					orgContext,
					params,
				}),
			});

			let sessionDead = false;
			try {
				const output = await runEngineLoop({
					braintrust: braintrustEnabled
						? {
								braintrustParent,
								persistBraintrustParent: (parent) =>
									cmaRepo.setBraintrustParent({
										db,
										env,
										orgId: org.id,
										parent,
										threadKey,
									}),
								spanName: "leaf-claude-managed-message",
							}
						: undefined,
					ctx,
					interrupt: () =>
						client.beta.sessions.events
							.send(activeSessionId, { events: [{ type: "user.interrupt" }] })
							.then(() => undefined),
					newSession,
					params,
					runTurn: async ({ onTurnEnd, span }) => {
						const outcome = await runClaudeManagedTurn({
							client,
							content,
							env,
							logger,
							onAction,
							onActionKeyed,
							onThinking,
							onTurnEnd,
							orgId: org.id,
							sessionId: activeSessionId,
							span,
						});
						sessionDead ||= Boolean(outcome.sessionDead);
						return outcome;
					},
					sessionId: activeSessionId,
				});
				return { output, sessionDead };
			} catch (error) {
				if (!(sessionDead || isMissingSessionApiError(error))) throw error;
				logger.warn("Claude Managed session is no longer usable", {
					event: "leaf.cma_session_dead",
					context: { env, org_id: org.id },
					data: { session_id: activeSessionId },
					error,
				});
				return { deadSessionError: error, sessionDead: true };
			}
		};

		const existingSession =
			claudeManagedSession ??
			(await perf.time("lookup_session", () =>
				getClaudeManagedSession({
					db,
					env,
					orgId: org.id,
					thread,
					userId: autumnUserId,
				}),
			));
		const sessionRef = existingSession ?? (await startFreshSession());
		perf.done("leaf.cma_setup_latency", {
			new_session: sessionRef.newSession,
			provider: thread.provider,
		});

		const attempt = await runOnSession({ sessionRef });
		// A dead session poisons every later turn in the thread, so drop the row
		// even when this turn still produced an answer.
		if (attempt.sessionDead) {
			await dropSessionRow({ sessionId: sessionRef.sessionId });
		}
		if (attempt.output) return attempt.output;
		// Only a resumed session is worth healing; a session created this turn
		// dying again means the failure isn't the stale id.
		if (sessionRef.newSession)
			throw deadSessionFailure(attempt.deadSessionError);

		logger.info("Retrying the turn on a fresh Claude Managed session", {
			event: "leaf.cma_session_healed",
			context: { env, org_id: org.id },
			data: { dead_session_id: sessionRef.sessionId },
		});
		const retry = await runOnSession({ sessionRef: await startFreshSession() });
		if (retry.output) return retry.output;
		throw deadSessionFailure(retry.deadSessionError);
	},
};
