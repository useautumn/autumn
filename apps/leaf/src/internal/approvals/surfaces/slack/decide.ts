import {
	type ChatApproval,
	Scopes,
	chatInstallations,
	checkScopes,
	type RouteScopeRequirement,
} from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { ActionEvent } from "chat";
import {
	isSlackAdminProvider,
	validateSlackAdminAccess,
} from "../../../slackAdmin/access.js";
import { resolveSlackUserAuth } from "../../../../agent/runMessage/setup/resolveSlackUserAuth.js";
import { decrypt } from "../../../../lib/crypto.js";
import { db } from "../../../../lib/db.js";
import { logger as rootLogger } from "../../../../lib/logger.js";
import { approvalStatusCard } from "../../../../ui/blocks.js";
import { createThrottledCardEditor } from "../../../../ui/throttledEditor.js";
import { chatApprovalRepo } from "../../repos/chatApprovalRepo.js";
import type { ApprovalActionDeps, ApprovalCardStatus } from "../../types.js";
import { approvalErrorResult, isErrorResult } from "../../utils/approvalErrors.js";
import { formatElapsed } from "../../utils/approvalProgress.js";
import { resolveApproval } from "../../actions/resolveApproval.js";

const detailsFromApproval = ({ approval }: { approval?: ChatApproval }) => ({
	toolName: approval?.tool_name ?? "billing action",
	toolArgs:
		approval?.tool_args && typeof approval.tool_args === "object"
			? (approval.tool_args as Record<string, unknown>)
			: undefined,
	env: approval?.env,
	preview: approval?.preview ?? undefined,
});

const approvalScopeRequirements: Record<string, RouteScopeRequirement> = {
	attach: [Scopes.Billing.Write],
	createBalance: [Scopes.Balances.Write],
	createPlan: [Scopes.Plans.Write],
	createSchedule: [Scopes.Billing.Write],
	updateCatalog: { ALL: [Scopes.Plans.Write, Scopes.Features.Write] },
	updatePlan: [Scopes.Plans.Write],
	updateSubscription: [Scopes.Billing.Write],
};

const authorizeSlackApprovalClicker = async ({
	approval,
	providerUserId,
}: {
	approval: ChatApproval;
	providerUserId: string;
}) => {
	const required = approvalScopeRequirements[approval.tool_name];
	if (!required || isSlackAdminProvider({ provider: approval.provider })) {
		return { allowed: true } as const;
	}

	const installation = await db.query.chatInstallations.findFirst({
		where: and(
			eq(chatInstallations.provider, approval.provider),
			eq(chatInstallations.workspace_id, approval.workspace_id),
		),
	});
	if (!installation) {
		return {
			allowed: false,
			text: "I couldn't verify your Slack workspace installation, so I can't approve this action.",
		} as const;
	}

	const auth = await resolveSlackUserAuth({
		botToken: decrypt(installation.bot_access_token),
		installation,
		logger: rootLogger,
		orgId: approval.org_id,
		slackUserId: providerUserId,
	});
	if (!auth.ok) {
		return { allowed: false, text: auth.text } as const;
	}

	const { allowed, missing } = checkScopes(required, auth.scopes);
	if (!allowed) {
		return {
			allowed: false,
			text: `You don't have permission to approve ${detailsFromApproval({ approval }).toolName}. Missing: ${missing.join(", ")}.`,
		} as const;
	}

	return { allowed: true } as const;
};

const defaultApprovalActionDeps: ApprovalActionDeps = {
	resolveApproval,
	cancelApproval: ({ approvalId, providerUserId }) =>
		chatApprovalRepo.cancel({ approvalId, db, providerUserId }),
	authorizeApprovalClicker: authorizeSlackApprovalClicker,
	claimApproval: ({ approvalId, providerUserId }) =>
		chatApprovalRepo.claim({ approvalId, db, providerUserId }),
	editActionMessage: async ({ content, event }) => {
		await event.adapter.editMessage?.(event.threadId, event.messageId, content);
	},
	getApproval: ({ approvalId }) => chatApprovalRepo.get({ approvalId, db }),
	logger: rootLogger,
	postThreadReply: async ({ event, markdown }) => {
		await event.thread?.post({ markdown });
	},
};

// Maps a DB row to the card state shown when a click can no longer act on it.
const cardStatusForApproval = ({
	approval,
}: {
	approval?: ChatApproval;
}): ApprovalCardStatus => {
	const status = approval?.status;
	if (status === "approved" || status === "cancelled" || status === "running")
		return status;
	if (status === "pending" && (approval?.expires_at ?? 0) <= Date.now())
		return "expired";
	return "failed";
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
		const current = await deps.getApproval({ approvalId });
		await deps.editActionMessage({
			content: approvalStatusCard({
				status: cardStatusForApproval({ approval: current }),
				...detailsFromApproval({ approval: current }),
				actorId: current?.decided_by_provider_user_id ?? undefined,
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

		const approval = await deps.getApproval({ approvalId });
		if (!approval) {
			await editToCurrentStatus();
			return;
		}
		if (
			approval.provider &&
			isSlackAdminProvider({ provider: approval.provider })
		) {
			const access = validateSlackAdminAccess({
				workspaceId: approval.workspace_id,
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

		if (event.actionId === "cancel_billing_action") {
			const cancelled = await deps.cancelApproval({
				approvalId,
				providerUserId,
			});
			if (!cancelled) {
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
					...detailsFromApproval({ approval: cancelled }),
					actorId: providerUserId,
				}),
				event,
			});
			deps.logger.info("Cancelled approval", {
				event: "leaf.approval_cancelled",
				approval_id: approvalId,
				tool: cancelled.tool_name,
			});
			return;
		}

		const authorization = await deps.authorizeApprovalClicker?.({
			approval,
			providerUserId,
		});
		if (authorization && !authorization.allowed) {
			deps.logger.warn("Approval action denied by Autumn scopes", {
				event: "leaf.approval_scope_denied",
				approval_id: approvalId,
				tool: approval.tool_name,
				data: { provider_user_id: providerUserId },
			});
			await deps.postThreadReply({
				event,
				markdown: authorization.text,
			});
			return;
		}

		// Claim first so exactly one click wins, then acknowledge in place.
		const claimed = await deps.claimApproval({ approvalId, providerUserId });
		if (!claimed) {
			deps.logger.warn("Approval claim rejected", {
				event: "leaf.approval_claim_rejected",
				approval_id: approvalId,
			});
			await editToCurrentStatus();
			return;
		}
		const details = detailsFromApproval({ approval: claimed });
		const startedAt = Date.now();
		let statusText: string | undefined;
		const renderRunningCard = () =>
			approvalStatusCard({
				status: "running",
				...details,
				actorId: providerUserId,
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
		try {
			await event.thread?.startTyping("Running the approved action…");
		} catch {
			// Typing status is cosmetic; never block the run on it.
		}

		const heartbeat = setInterval(() => editor.requestEdit(), 10_000);
		let result: Awaited<ReturnType<ApprovalActionDeps["resolveApproval"]>>;
		try {
			result = await deps.resolveApproval({
				approval: claimed,
				onProgress: (line) => {
					statusText = line;
					editor.requestEdit();
				},
				providerUserId,
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
			tool: details.toolName,
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

		await deps.editActionMessage({
			content: approvalStatusCard({
				status: failed ? "failed" : "approved",
				...details,
				actorId: providerUserId,
				result,
			}),
			event,
		});
	} catch (error) {
		deps.logger.error("[chat] Approval action failed", error, {
			event: "leaf.approval_failed",
			approval_id: approvalId,
			action: event.actionId,
		});
		const current = await deps.getApproval({ approvalId });
		await deps.editActionMessage({
			content: approvalStatusCard({
				status: cardStatusForApproval({ approval: current }),
				...detailsFromApproval({ approval: current }),
				result: approvalErrorResult(error),
			}),
			event,
		});
	}
};

/** Positional signature kept for the chat SDK's action-handler callback boundary. */
export const handleApprovalAction = async (event: ActionEvent) =>
	handleApprovalActionWithDeps({ event });
