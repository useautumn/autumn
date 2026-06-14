import Anthropic from "@anthropic-ai/sdk";
import { all } from "better-all";
import { ensureLeafResources } from "../../../harness/claudeManaged/ensureLeafResources.js";
import { ensureMemoryStore } from "../../../harness/claudeManaged/memory/ensureMemoryStore.js";
import { cmaRepo } from "../../../harness/claudeManaged/repos/claudeManagedRepo.js";
import {
	createClaudeManagedSession,
	getClaudeManagedSession,
} from "../../../harness/claudeManaged/session/ensureSession.js";
import { runClaudeManagedTurn } from "../../../harness/claudeManaged/session/runManagedTurn.js";
import { buildUserMessageContent } from "../../../harness/claudeManaged/session/userMessage.js";
import { ensureAutumnVault } from "../../../harness/claudeManaged/vaults/ensureAutumnVault.js";
import { buildHarnessMessageText } from "../../../harness/common/messageText.js";
import { runEngineLoop } from "../../../harness/common/runEngineLoop.js";
import { cancelPendingSessionApprovals } from "../../../internal/approvals/actions/cancelPendingSessionApprovals.js";
import { autumnOrgContextService } from "../../../internal/autumnMcp/orgContextService.js";
import { claudeManagedMemoryEnabled } from "../../../lib/chatAgentConfig.js";
import { db } from "../../../lib/db.js";
import { createBraintrustLogger } from "../../../providers/braintrust/index.js";
import type { AgentEngine } from "../types.js";

const client = new Anthropic();
// initLogger sets Braintrust's ambient logger so traced()/spans are recorded.
const braintrustLogger = createBraintrustLogger();
const braintrustEnabled = Boolean(braintrustLogger);

export const claudeManagedEngine: AgentEngine = {
	name: "claude-managed",
	run: async ({ ctx, params }) => {
		const {
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

		const existingSession =
			claudeManagedSession ??
			(await getClaudeManagedSession({ db, env, orgId: org.id, thread }));

		let sessionRef = existingSession;
		let orgContext: Awaited<ReturnType<typeof autumnOrgContextService.load>>;
		if (!sessionRef) {
			const {
				memoryStoreId,
				orgContext: loadedOrgContext,
				resources: { agentId, environmentId },
				vaultId,
			} = await all({
				async resources() {
					return ensureLeafResources({ client, env, logger, token });
				},
				async vaultId() {
					return ensureAutumnVault({
						client,
						env,
						orgId: org.id,
						provider: thread.provider,
						workspaceId: thread.workspaceId,
					});
				},
				async memoryStoreId() {
					return claudeManagedMemoryEnabled
						? ensureMemoryStore({ client, env, orgId: org.id })
						: undefined;
				},
				async orgContext() {
					return autumnOrgContextService.load({ env, logger, token });
				},
			});
			orgContext = loadedOrgContext;
			sessionRef = await createClaudeManagedSession({
				agentId,
				client,
				db,
				env,
				environmentId,
				memoryStoreId,
				orgId: org.id,
				thread,
				vaultId,
			});
		}

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
			text: buildHarnessMessageText({ env, newSession, orgContext, params }),
		});

		return runEngineLoop({
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
			runTurn: ({ isCancelled, onTurnEnd, previewCapture, span }) =>
				runClaudeManagedTurn({
					client,
					content,
					env,
					isCancelled,
					logger,
					onAction,
					onActionKeyed,
					onThinking,
					onTurnEnd,
					orgId: org.id,
					previewCapture,
					sessionId: activeSessionId,
					span,
				}),
			sessionId: activeSessionId,
		});
	},
};
