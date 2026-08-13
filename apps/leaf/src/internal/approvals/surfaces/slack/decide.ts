import {
	type ChatApproval,
	chatInstallations,
	checkScopes,
} from "@autumn/shared";
import type { ActionEvent } from "chat";
import { and, eq } from "drizzle-orm";
import { resolveSlackCallerAuth } from "../../../../agent/runMessage/setup/resolveSlackCallerAuth.js";
import { denyEveApprovalGroup } from "../../../../harness/eve/approval.js";
import { db } from "../../../../lib/db.js";
import { logger as rootLogger } from "../../../../lib/logger.js";
import { approvalStatusCard } from "../../../../ui/blocks.js";
import { questionCard } from "../../../../ui/eveCards.js";
import { createThrottledCardEditor } from "../../../../ui/throttledEditor.js";
import { getInstallationOAuthAccessToken } from "../../../installations/actions/getInstallationOAuthAccessToken.js";
import { validateSlackAdminAccess } from "../../../slackAdmin/access.js";
import { isInternalAutumnSlackProvider } from "../../../slackAdmin/provider.js";
import { resolveApprovalGroup } from "../../actions/resolveApprovalGroup.js";
import { chatApprovalRepo } from "../../repos/chatApprovalRepo.js";
import type {
	ApprovalActionDeps,
	ApprovalAuthorization,
	ApprovalCardStatus,
	ApprovalGroupRunResult,
} from "../../types.js";
import {
	approvalErrorResult,
	isErrorResult,
} from "../../utils/approvalErrors.js";
import { formatElapsed } from "../../utils/approvalProgress.js";
import { approvalScopeRequirements } from "../../utils/approvalScopeRequirements.js";
import { approvalCardItems } from "./cardItems.js";
import { postApprovalCardForGroup } from "./present.js";

const authorizeSlackApprovalClicker = async ({
	approval,
	providerUserId,
}: {
	approval: ChatApproval;
	providerUserId: string;
}): Promise<ApprovalAuthorization> => {
	const toolName = approval.tool_name;

	// Slack-admin approvals are gated upstream by validateSlackAdminAccess.
	if (isInternalAutumnSlackProvider({ provider: approval.provider })) {
		return { allowed: true };
	}

	// A gated tool without a declared scope requirement fails closed.
	const required = approvalScopeRequirements[approval.tool_name];
	if (!required) {
		rootLogger.warn("Approval tool missing scope requirement", {
			event: "leaf.approval_scope_requirement_missing",
			tool: approval.tool_name,
			data: { org_id: approval.org_id, provider: approval.provider },
		});
		return {
			allowed: false,
			text: `I can't determine the permissions required to approve ${toolName}, so I won't run it.`,
		};
	}

	const installation = await db.query.chatInstallations.findFirst({
		where: and(
			eq(chatInstallations.org_id, approval.org_id),
			eq(chatInstallations.provider, approval.provider),
			eq(chatInstallations.workspace_id, approval.workspace_id),
		),
	});
	if (!installation) {
		return {
			allowed: false,
			text: "I couldn't verify your Slack workspace installation, so I can't approve this action.",
		};
	}

	const callerAuth = await resolveSlackCallerAuth({
		installation,
		logger: rootLogger,
		orgId: approval.org_id,
		slackUserId: providerUserId,
	});
	if (!callerAuth.usePerUser) {
		// The session already runs under the installer token; no approver token needed.
		return { allowed: true };
	}

	if (!callerAuth.ok) {
		return { allowed: false, text: callerAuth.text };
	}

	const { allowed, missing } = checkScopes(required, callerAuth.scopes);
	if (!allowed) {
		return {
			allowed: false,
			text: `You don't have permission to approve ${toolName}. Missing: ${missing.join(", ")}.`,
		};
	}

	const approverToken = await getInstallationOAuthAccessToken({
		installation,
		env: approval.env,
		orgId: approval.org_id,
		userId: callerAuth.userId,
	});

	return { allowed: true, approverToken };
};

const defaultApprovalActionDeps: ApprovalActionDeps = {
	resolveApprovalGroup,
	cancelApprovalGroup: ({ approvals, providerUserId }) =>
		chatApprovalRepo.cancelGroup({ approvals, db, providerUserId }),
	authorizeApprovalClicker: authorizeSlackApprovalClicker,
	claimApprovalGroup: ({ approvals, providerUserId }) =>
		chatApprovalRepo.claimGroup({ approvals, db, providerUserId }),
	releaseApprovalGroup: ({ approvals, providerUserId }) =>
		chatApprovalRepo.releaseGroup({ approvals, db, providerUserId }),
	editActionMessage: async ({ content, event }) => {
		await event.adapter.editMessage?.(event.threadId, event.messageId, content);
	},
	getApprovalGroup: ({ approvalId }) =>
		chatApprovalRepo.getGroup({ approvalId, db }),
	logger: rootLogger,
	postThreadReply: async ({ event, markdown }) => {
		await event.thread?.post({ markdown });
	},
};

// The card state shown when a click can no longer act on the group. Rows are
// decided in one statement, so the first row speaks for the settled states.
const cardStatusForApprovals = ({
	approvals,
}: {
	approvals: ChatApproval[];
}): ApprovalCardStatus => {
	// A sibling mid-run outranks the first row: painting the group settled while
	// a write is still landing would misreport it.
	if (approvals.some((approval) => approval.status === "running"))
		return "running";
	const [first] = approvals;
	const status = first?.status;
	if (status === "approved" || status === "cancelled") return status;
	if (status === "pending" && (first?.expires_at ?? 0) <= Date.now())
		return "expired";
	return "failed";
};

/** Re-reads the group and repaints the card to whatever it says now — the reply
 * to any click that arrived too late to act. */
const editCardToCurrentStatus = async ({
	approvalId,
	deps,
	event,
	failure,
}: {
	approvalId: string;
	deps: ApprovalActionDeps;
	event: ActionEvent;
	failure?: ReturnType<typeof approvalErrorResult>;
}) => {
	const current = await deps.getApprovalGroup({ approvalId });
	await deps.editActionMessage({
		content: approvalStatusCard({
			status: cardStatusForApprovals({ approvals: current }),
			// A crash card has no owner — the last decider didn't cause it.
			actorId: failure
				? undefined
				: (current[0]?.decided_by_provider_user_id ?? undefined),
			env: current[0]?.env,
			failure,
			items: approvalCardItems(current),
		}),
		event,
	});
};

const slackAdminActionAllowed = ({
	approval,
	approvalId,
	deps,
}: {
	approval: ChatApproval;
	approvalId: string;
	deps: ApprovalActionDeps;
}) => {
	if (
		!approval.provider ||
		!isInternalAutumnSlackProvider({ provider: approval.provider })
	)
		return true;
	const access = validateSlackAdminAccess({
		workspaceId: approval.workspace_id,
	});
	if (access.allowed) return true;
	deps.logger.warn("Slack admin approval action denied", {
		event: "leaf.slack_admin_approval_denied",
		approval_id: approvalId,
		data: { reason: access.reason },
	});
	return false;
};

/** Eve parks the whole turn on the approvals — deny them in the session too, or
 * it keeps waiting and the discarded writes can still run later. */
const denyEveGroupForDismissal = async ({
	approvalId,
	approvals,
	deps,
	event,
	providerUserId,
}: {
	approvalId: string;
	approvals: ChatApproval[];
	deps: ApprovalActionDeps;
	event: ActionEvent;
	providerUserId: string;
}) => {
	const denied = await denyEveApprovalGroup({ approvals, providerUserId });
	if ("error" in denied && denied.error) {
		deps.logger.warn("Could not deny Eve approvals on dismiss", {
			event: "leaf.eve_dismiss_deny_failed",
			approval_id: approvalId,
			data: { message: denied.message },
		});
		return;
	}
	if (!("text" in denied) || !denied.text.trim()) return;
	try {
		await deps.postThreadReply({ event, markdown: denied.text });
	} catch {
		// The acknowledgement reply is cosmetic.
	}
};

const dismissApprovalGroup = async ({
	approvalId,
	approvals,
	deps,
	event,
	items,
	providerUserId,
}: {
	approvalId: string;
	approvals: ChatApproval[];
	deps: ApprovalActionDeps;
	event: ActionEvent;
	items: ReturnType<typeof approvalCardItems>;
	providerUserId: string;
}) => {
	const [first] = approvals;
	// Dismissal is all-or-nothing: cancelling the pending rows while a sibling
	// already runs would show Dismissed over a write that lands.
	const pendingCount = approvals.filter(
		(approval) => approval.status === "pending",
	).length;
	if (pendingCount !== approvals.length) {
		deps.logger.warn("Approval cancellation ignored", {
			event: "leaf.approval_cancel_ignored",
			approval_id: approvalId,
			data: { pending: pendingCount, expected: approvals.length },
		});
		await editCardToCurrentStatus({ approvalId, deps, event });
		return;
	}

	if (first?.harness === "eve")
		await denyEveGroupForDismissal({
			approvalId,
			approvals,
			deps,
			event,
			providerUserId,
		});

	const cancelled = await deps.cancelApprovalGroup({
		approvals,
		providerUserId,
	});
	if (cancelled.length !== approvals.length) {
		deps.logger.warn("Approval cancellation ignored", {
			event: "leaf.approval_cancel_ignored",
			approval_id: approvalId,
			data: { cancelled: cancelled.length, expected: approvals.length },
		});
		await editCardToCurrentStatus({ approvalId, deps, event });
		return;
	}

	await deps.editActionMessage({
		content: approvalStatusCard({
			status: "cancelled",
			actorId: providerUserId,
			env: first?.env,
			items,
		}),
		event,
	});
	deps.logger.info("Cancelled approval", {
		event: "leaf.approval_cancelled",
		approval_id: approvalId,
		data: { count: cancelled.length },
	});
};

/** Claims every row or none: a partial claim means another click is already
 * running some of these writes, so hand back what we took. */
const claimGroupForDecision = async ({
	approvalId,
	approvals,
	deps,
	event,
	providerUserId,
}: {
	approvalId: string;
	approvals: ChatApproval[];
	deps: ApprovalActionDeps;
	event: ActionEvent;
	providerUserId: string;
}) => {
	const claimed = await deps.claimApprovalGroup({ approvals, providerUserId });
	if (claimed.length === approvals.length) return claimed;
	await deps.releaseApprovalGroup?.({ approvals: claimed, providerUserId });
	deps.logger.warn("Approval claim rejected", {
		event: "leaf.approval_claim_rejected",
		approval_id: approvalId,
		data: { claimed: claimed.length, expected: approvals.length },
	});
	await editCardToCurrentStatus({ approvalId, deps, event });
	return null;
};

/** Every write in the group must be permitted before any of them runs — a
 * partial approval would apply some writes and strand the rest. */
const authorizeGroup = async ({
	approvals,
	deps,
	providerUserId,
}: {
	approvals: ChatApproval[];
	deps: ApprovalActionDeps;
	providerUserId: string;
}) => {
	let approverToken: string | undefined;
	for (const approval of approvals) {
		const authorization = await deps.authorizeApprovalClicker?.({
			approval,
			providerUserId,
		});
		if (authorization && !authorization.allowed) return authorization;
		approverToken ??= authorization?.approverToken;
	}
	return { allowed: true as const, approverToken };
};

/** Returns the authorization, or null once it has released the claim and told
 * the user why nothing ran. */
const authorizeGroupOrRelease = async ({
	approvalId,
	claimed,
	deps,
	event,
	providerUserId,
}: {
	approvalId: string;
	claimed: ChatApproval[];
	deps: ApprovalActionDeps;
	event: ActionEvent;
	providerUserId: string;
}) => {
	let authorization: Awaited<ReturnType<typeof authorizeGroup>>;
	try {
		authorization = await authorizeGroup({
			approvals: claimed,
			deps,
			providerUserId,
		});
	} catch (error) {
		await deps.releaseApprovalGroup?.({ approvals: claimed, providerUserId });
		deps.logger.error("[chat] Approval authorization failed", error, {
			event: "leaf.approval_authorization_failed",
			approval_id: approvalId,
			data: { provider_user_id: providerUserId },
		});
		await deps.postThreadReply({
			event,
			markdown:
				"I couldn't verify your Autumn permissions, so I didn't run this action. Please try again.",
		});
		return null;
	}

	if (authorization.allowed) return authorization;
	await deps.releaseApprovalGroup?.({ approvals: claimed, providerUserId });
	deps.logger.warn("Approval action denied by Autumn scopes", {
		event: "leaf.approval_scope_denied",
		approval_id: approvalId,
		data: { provider_user_id: providerUserId },
	});
	await deps.postThreadReply({ event, markdown: authorization.text });
	return null;
};

/** Runs the group while the card ticks over with the resumer's progress, so a
 * long fan-out doesn't look hung. */
const runApprovalGroupWithLiveCard = async ({
	approverToken,
	claimed,
	deps,
	env,
	event,
	items,
	providerUserId,
}: {
	approverToken?: string;
	claimed: ChatApproval[];
	deps: ApprovalActionDeps;
	env: ChatApproval["env"];
	event: ActionEvent;
	items: ReturnType<typeof approvalCardItems>;
	providerUserId: string;
}) => {
	const startedAt = Date.now();
	let statusText: string | undefined;
	const editor = createThrottledCardEditor({
		edit: () =>
			deps.editActionMessage({
				content: approvalStatusCard({
					status: "running",
					actorId: providerUserId,
					env,
					items,
					statusLine: statusText
						? Date.now() - startedAt >= 10_000
							? `${statusText} · ${formatElapsed(startedAt)}`
							: statusText
						: undefined,
				}),
				event,
			}),
	});
	editor.requestEdit();

	const heartbeat = setInterval(() => editor.requestEdit(), 10_000);
	try {
		return await deps.resolveApprovalGroup({
			approvals: claimed,
			onProgress: (line) => {
				statusText = line;
				editor.requestEdit();
			},
			providerUserId,
			approverToken,
		});
	} finally {
		clearInterval(heartbeat);
		await editor.finalize();
	}
};

const postApprovalOutcomeReply = async ({
	approvalId,
	deps,
	event,
	text,
}: {
	approvalId: string;
	deps: ApprovalActionDeps;
	event: ActionEvent;
	text: string;
}) => {
	try {
		await deps.postThreadReply({ event, markdown: text });
	} catch (error) {
		deps.logger.warn("Could not post approval outcome reply", {
			event: "leaf.approval_reply_failed",
			approval_id: approvalId,
			error,
		});
	}
};

/** The resumed turn can park again (chained writes or a question) where nothing
 * streams — surface those as fresh cards or they stay invisible. */
const surfaceChainedInteraction = async ({
	approvalId,
	deps,
	env,
	event,
	orgId,
	result,
}: {
	approvalId: string;
	deps: ApprovalActionDeps;
	env: ChatApproval["env"];
	event: ActionEvent;
	orgId: string;
	result: ApprovalGroupRunResult;
}) => {
	if (!event.thread) return;
	try {
		if ("chainedGroupId" in result && result.chainedGroupId) {
			const chained = await deps.getApprovalGroup({
				approvalId: result.chainedGroupId,
			});
			if (chained.length > 0)
				await postApprovalCardForGroup({
					approvals: chained,
					logger: rootLogger,
					target: event.thread,
				});
		}
		if ("question" in result && result.question)
			await event.thread.post(
				questionCard({
					env,
					options: result.question.options,
					orgId,
					prompt: result.question.prompt,
					requestId: result.question.requestId,
					sessionId: result.question.sessionId,
				}),
			);
	} catch (error) {
		deps.logger.warn("Could not surface chained interaction", {
			event: "leaf.approval_chained_surface_failed",
			approval_id: approvalId,
			error,
		});
	}
};

export const handleApprovalActionWithDeps = async ({
	deps = defaultApprovalActionDeps,
	event,
}: {
	deps?: ApprovalActionDeps;
	event: ActionEvent;
}) => {
	const approvalId = event.value;
	if (!approvalId) return;
	const providerUserId = event.user.userId;

	try {
		deps.logger.info("Received approval action", {
			event: "leaf.approval_action_received",
			approval_id: approvalId,
			action: event.actionId,
			data: { provider_user_id: providerUserId },
		});

		const approvals = await deps.getApprovalGroup({ approvalId });
		const [first] = approvals;
		if (!first) {
			await editCardToCurrentStatus({ approvalId, deps, event });
			return;
		}
		if (!slackAdminActionAllowed({ approval: first, approvalId, deps })) return;

		const items = approvalCardItems(approvals);
		const env = first.env;

		if (event.actionId === "cancel_billing_action") {
			await dismissApprovalGroup({
				approvalId,
				approvals,
				deps,
				event,
				items,
				providerUserId,
			});
			return;
		}

		// Claim first so exactly one click wins; losers never reach authorization.
		const claimed = await claimGroupForDecision({
			approvalId,
			approvals,
			deps,
			event,
			providerUserId,
		});
		if (!claimed) return;

		// On denial, the claims are released so another authorized user can approve.
		const authorization = await authorizeGroupOrRelease({
			approvalId,
			claimed,
			deps,
			event,
			providerUserId,
		});
		if (!authorization) return;

		const result = await runApprovalGroupWithLiveCard({
			approverToken: authorization.approverToken,
			claimed,
			deps,
			env,
			event,
			items,
			providerUserId,
		});
		const failed = isErrorResult(result);
		deps.logger.info("Completed approval action", {
			event: "leaf.approval_completed",
			approval_id: approvalId,
			status: failed ? "failed" : "approved",
			data: { count: claimed.length },
		});

		if (!failed) {
			// The agent's continuation is conversation — it belongs in the thread,
			// while the card stays a compact record of what ran.
			if ("text" in result && result.text.trim())
				await postApprovalOutcomeReply({
					approvalId,
					deps,
					event,
					text: result.text,
				});
			await surfaceChainedInteraction({
				approvalId,
				deps,
				env,
				event,
				orgId: first.org_id,
				result,
			});
		}

		const toolOutputs =
			!failed && "results" in result ? result.results : undefined;
		await deps.editActionMessage({
			content: approvalStatusCard({
				status: failed ? "failed" : "approved",
				actorId: providerUserId,
				env,
				failure: failed ? result : undefined,
				items,
				results:
					toolOutputs && claimed.map((approval) => toolOutputs[approval.id]),
			}),
			event,
		});
	} catch (error) {
		deps.logger.error("[chat] Approval action failed", error, {
			event: "leaf.approval_failed",
			approval_id: approvalId,
			action: event.actionId,
		});
		await editCardToCurrentStatus({
			approvalId,
			deps,
			event,
			failure: approvalErrorResult(error),
		});
	}
};

/** Positional signature kept for the chat SDK's action-handler callback boundary. */
export const handleApprovalAction = async (event: ActionEvent) =>
	handleApprovalActionWithDeps({ event });
