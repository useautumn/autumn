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

// Maps the group's rows to the card state shown when a click can no longer act
// on it. A mixed group takes the least-settled state so the card never claims
// more finality than the rows have.
const cardStatusForApprovals = ({
	approvals,
}: {
	approvals: ChatApproval[];
}): ApprovalCardStatus => {
	const [first] = approvals;
	const status = first?.status;
	if (status === "approved" || status === "cancelled" || status === "running")
		return status;
	if (status === "pending" && (first?.expires_at ?? 0) <= Date.now())
		return "expired";
	return "failed";
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
		approverToken ??= authorization?.allowed
			? authorization.approverToken
			: undefined;
	}
	return { allowed: true as const, approverToken };
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

	const editToCurrentStatus = async () => {
		const current = await deps.getApprovalGroup({ approvalId });
		await deps.editActionMessage({
			content: approvalStatusCard({
				status: cardStatusForApprovals({ approvals: current }),
				actorId: current[0]?.decided_by_provider_user_id ?? undefined,
				env: current[0]?.env,
				items: approvalCardItems(current),
			}),
			event,
		});
	};

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
			await editToCurrentStatus();
			return;
		}
		if (
			first.provider &&
			isInternalAutumnSlackProvider({ provider: first.provider })
		) {
			const access = validateSlackAdminAccess({
				workspaceId: first.workspace_id,
			});
			if (!access.allowed) {
				deps.logger.warn("Slack admin approval action denied", {
					event: "leaf.slack_admin_approval_denied",
					approval_id: approvalId,
					data: { reason: access.reason },
				});
				return;
			}
		}

		const items = approvalCardItems(approvals);
		const env = first.env;

		if (event.actionId === "cancel_billing_action") {
			// Eve parks the whole turn on the approvals — deny them in the session
			// too, or it keeps waiting, holds the next message behind the stale
			// approvals, and the discarded writes can still run later.
			const pending = approvals.filter(
				(approval) => approval.status === "pending",
			);
			if (first.harness === "eve" && pending.length > 0) {
				const denied = await denyEveApprovalGroup({
					approvals: pending,
					providerUserId,
				});
				if ("error" in denied && denied.error) {
					deps.logger.warn("Could not deny Eve approvals on dismiss", {
						event: "leaf.eve_dismiss_deny_failed",
						approval_id: approvalId,
						data: { message: denied.message },
					});
				} else if ("text" in denied && denied.text.trim()) {
					try {
						await deps.postThreadReply({ event, markdown: denied.text });
					} catch {
						// The acknowledgement reply is cosmetic.
					}
				}
			}
			const cancelled = await deps.cancelApprovalGroup({
				approvals,
				providerUserId,
			});
			if (cancelled.length === 0) {
				deps.logger.warn("Approval cancellation ignored", {
					event: "leaf.approval_cancel_ignored",
					approval_id: approvalId,
				});
				await editToCurrentStatus();
				return;
			}
			await deps.editActionMessage({
				content: approvalStatusCard({
					status: "cancelled",
					actorId: providerUserId,
					env,
					items,
				}),
				event,
			});
			deps.logger.info("Cancelled approval", {
				event: "leaf.approval_cancelled",
				approval_id: approvalId,
				data: { count: cancelled.length },
			});
			return;
		}

		// Claim first so exactly one click wins; losers never reach authorization.
		const claimed = await deps.claimApprovalGroup({
			approvals,
			providerUserId,
		});
		if (claimed.length !== approvals.length) {
			// A partial claim means another click is already running some of these
			// writes — hand back what we took rather than running a subset.
			await deps.releaseApprovalGroup?.({
				approvals: claimed,
				providerUserId,
			});
			deps.logger.warn("Approval claim rejected", {
				event: "leaf.approval_claim_rejected",
				approval_id: approvalId,
				data: { claimed: claimed.length, expected: approvals.length },
			});
			await editToCurrentStatus();
			return;
		}

		// On denial, release the claims so another authorized user can still approve.
		let authorization: Awaited<ReturnType<typeof authorizeGroup>> | undefined;
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
			return;
		}
		if (!authorization.allowed) {
			await deps.releaseApprovalGroup?.({ approvals: claimed, providerUserId });
			deps.logger.warn("Approval action denied by Autumn scopes", {
				event: "leaf.approval_scope_denied",
				approval_id: approvalId,
				data: { provider_user_id: providerUserId },
			});
			await deps.postThreadReply({ event, markdown: authorization.text });
			return;
		}

		const startedAt = Date.now();
		let statusText: string | undefined;
		const renderRunningCard = () =>
			approvalStatusCard({
				status: "running",
				actorId: providerUserId,
				env,
				items,
				statusLine: statusText
					? Date.now() - startedAt >= 10_000
						? `${statusText} · ${formatElapsed(startedAt)}`
						: statusText
					: undefined,
			});
		const editor = createThrottledCardEditor({
			edit: () =>
				deps.editActionMessage({ content: renderRunningCard(), event }),
		});
		editor.requestEdit();

		const heartbeat = setInterval(() => editor.requestEdit(), 10_000);
		let result: Awaited<ReturnType<ApprovalActionDeps["resolveApprovalGroup"]>>;
		try {
			result = await deps.resolveApprovalGroup({
				approvals: claimed,
				onProgress: (line) => {
					statusText = line;
					editor.requestEdit();
				},
				providerUserId,
				approverToken: authorization.approverToken,
			});
		} finally {
			clearInterval(heartbeat);
			await editor.finalize();
		}
		const failed = isErrorResult(result);
		deps.logger.info("Completed approval action", {
			event: "leaf.approval_completed",
			approval_id: approvalId,
			status: failed ? "failed" : "approved",
			data: { count: claimed.length },
		});

		// The agent's continuation is conversation — it belongs in the thread,
		// while the card stays a compact record of what ran.
		if (!failed && "text" in result && result.text.trim()) {
			try {
				await deps.postThreadReply({ event, markdown: result.text });
			} catch (error) {
				deps.logger.warn("Could not post approval outcome reply", {
					event: "leaf.approval_reply_failed",
					approval_id: approvalId,
					error,
				});
			}
		}
		// The resumed turn can park again (chained writes or a question) where
		// nothing streams — surface those as fresh cards or they stay invisible.
		if (!failed && event.thread) {
			try {
				if ("chainedGroupId" in result && result.chainedGroupId) {
					const chained = await deps.getApprovalGroup({
						approvalId: result.chainedGroupId,
					});
					if (chained.length > 0) {
						await postApprovalCardForGroup({
							approvals: chained,
							logger: rootLogger,
							target: event.thread,
						});
					}
				}
				if ("question" in result && result.question) {
					await event.thread.post(
						questionCard({
							env,
							options: result.question.options,
							orgId: first.org_id,
							prompt: result.question.prompt,
							requestId: result.question.requestId,
							sessionId: result.question.sessionId,
						}),
					);
				}
			} catch (error) {
				deps.logger.warn("Could not surface chained interaction", {
					event: "leaf.approval_chained_surface_failed",
					approval_id: approvalId,
					error,
				});
			}
		}

		await deps.editActionMessage({
			content: approvalStatusCard({
				status: failed ? "failed" : "approved",
				actorId: providerUserId,
				env,
				failure: failed ? result : undefined,
				items,
				results: failed
					? undefined
					: claimed.map((approval) =>
							"results" in result ? result.results?.[approval.id] : undefined,
						),
			}),
			event,
		});
	} catch (error) {
		deps.logger.error("[chat] Approval action failed", error, {
			event: "leaf.approval_failed",
			approval_id: approvalId,
			action: event.actionId,
		});
		const current = await deps.getApprovalGroup({ approvalId });
		await deps.editActionMessage({
			content: approvalStatusCard({
				status: cardStatusForApprovals({ approvals: current }),
				env: current[0]?.env,
				failure: approvalErrorResult(error),
				items: approvalCardItems(current),
			}),
			event,
		});
	}
};

/** Positional signature kept for the chat SDK's action-handler callback boundary. */
export const handleApprovalAction = async (event: ActionEvent) =>
	handleApprovalActionWithDeps({ event });
