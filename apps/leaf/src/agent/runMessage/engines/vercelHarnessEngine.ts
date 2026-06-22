import { autumnChatInstructions } from "../../../harness/common/instructions/index.js";
import { buildHarnessMessageText } from "../../../harness/common/messageText.js";
import { runEngineLoop } from "../../../harness/common/runEngineLoop.js";
import { buildThreadKey } from "../../../harness/common/threadKey.js";
import { buildAutumnHostTools } from "../../../harness/vercelHarness/agent/autumnHostTools.js";
import { buildLeafHarnessAgent } from "../../../harness/vercelHarness/agent/buildHarnessAgent.js";
import { prewarmAiSdkHarness } from "../../../harness/vercelHarness/agent/prewarm.js";
import { vercelHarnessRepo } from "../../../harness/vercelHarness/repos/vercelHarnessRepo.js";
import type { PersistedHarnessState } from "../../../harness/vercelHarness/session/driveTurn.js";
import { driveVercelTurn } from "../../../harness/vercelHarness/session/driveTurn.js";
import { getVercelHarnessSession } from "../../../harness/vercelHarness/session/ensureSession.js";
import { supersedeRunApprovals } from "../../../internal/approvals/actions/supersedeRunApprovals.js";
import { autumnOrgContextService } from "../../../internal/autumnMcp/orgContextService.js";
import { db } from "../../../lib/db.js";
import { createBraintrustLogger } from "../../../providers/braintrust/index.js";
import { formatToolAction } from "../../tools/autumnMcp.js";
import { createPreviewCapture, isSilentTool } from "../../tools/toolPolicy.js";
import type { AgentEngine } from "../types.js";

const braintrustEnabled = Boolean(createBraintrustLogger());

export const vercelHarnessEngine: AgentEngine = {
	name: "vercel",
	run: async ({ ctx, params }) => {
		const {
			agentTools,
			env,
			logger,
			onAction,
			onAgentReady,
			onApprovalsSuperseded,
			org,
			providerUserId,
			thread,
			token,
		} = ctx;
		const instructions = [autumnChatInstructions, agentTools.docsText]
			.filter(Boolean)
			.join("\n\n");

		const existing =
			ctx.vercelHarnessSession ??
			(await getVercelHarnessSession({ db, env, orgId: org.id, thread }));
		const newSession = !existing;
		const threadKey = existing?.threadKey ?? buildThreadKey({ env, thread });

		// A new message on a thread with a pending approval supersedes it — cancel
		// the stale cards before this turn (no harness session events needed).
		if (existing) {
			const { cancelledApprovals, cancelledCount } =
				await supersedeRunApprovals({
					db,
					logger,
					providerUserId,
					query: {
						channelId: thread.channelId,
						env,
						orgId: org.id,
						provider: thread.provider,
						runId: existing.sessionId,
						workspaceId: thread.workspaceId,
					},
				});
			if (cancelledCount > 0) {
				await onApprovalsSuperseded?.(cancelledApprovals);
			}
		}

		// Preview capture is shared between the host tools (which capture on the
		// preview tool's execute) and the loop (which assembles previewApproval).
		const previewCapture = createPreviewCapture();
		const [orgContext, hostTools] = await Promise.all([
			newSession
				? autumnOrgContextService.load({ env, logger, token })
				: undefined,
			buildAutumnHostTools({ env, logger, previewCapture, token }),
			// Ensure the recipe-keyed template snapshot exists so the session forks
			// from it instead of running the bridge install.
			prewarmAiSdkHarness(),
		]);

		const resumeFrom =
			existing &&
			(existing.resumeState as PersistedHarnessState | undefined)?.kind ===
				"resume"
				? (
						existing.resumeState as Extract<
							PersistedHarnessState,
							{ kind: "resume" }
						>
					).state
				: undefined;

		try {
			const agent = await buildLeafHarnessAgent({
				destructiveTools: hostTools.destructiveTools,
				env,
				instructions,
				token,
				tools: hostTools.tools,
			});
			const session = await agent.createSession(
				existing ? { resumeFrom, sessionId: existing.sessionId } : {},
			);

			await vercelHarnessRepo.upsertSession({
				db,
				env,
				orgId: org.id,
				resumeState: existing?.resumeState,
				sessionId: session.sessionId,
				threadKey,
			});
			ctx.run?.resolveSessionId(session.sessionId);

			await onAgentReady?.();

			const prompt = buildHarnessMessageText({
				env,
				newSession,
				orgContext,
				params,
			});
			const abortController = new AbortController();

			return await runEngineLoop({
				braintrust: braintrustEnabled
					? {
							braintrustParent: existing?.braintrustParent,
							persistBraintrustParent: (parent) =>
								vercelHarnessRepo.setBraintrustParent({
									db,
									env,
									orgId: org.id,
									parent,
									threadKey,
								}),
							spanName: "leaf-vercel-harness-message",
						}
					: undefined,
				ctx,
				interrupt: () => abortController.abort(),
				newSession,
				params,
				previewCapture,
				runTurn: ({ onTurnEnd, span }) =>
					driveVercelTurn({
						abortSignal: abortController.signal,
						agent,
						onAutumnTool: async (name) => {
							if (!isSilentTool(name)) {
								await onAction?.(
									formatToolAction({ args: {}, toolName: name }),
								);
							}
						},
						onTurnEnd,
						persist: (state) =>
							vercelHarnessRepo.setResumeState({
								db,
								env,
								orgId: org.id,
								resumeState: state,
								threadKey,
							}),
						previewCapture,
						prompt,
						session,
						span,
					}),
				sessionId: session.sessionId,
			});
		} finally {
			await hostTools.disconnect();
		}
	},
};
