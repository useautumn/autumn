import type { ChatApproval } from "@autumn/shared";
import type { ActionEvent } from "chat";
import { db } from "../../../lib/db.js";
import { logger as rootLogger } from "../../../lib/logger.js";
import { approvalStatusCard } from "../../../ui/blocks.js";
import { chatApprovalRepo } from "../repos/chatApprovalRepo.js";
import type { ApprovalActionDeps, ApprovalCardStatus } from "../types.js";
import { approvalErrorResult, isErrorResult } from "../utils/approvalErrors.js";
import { approveAndRun } from "./approveAndRun.js";

const detailsFromApproval = ({ approval }: { approval?: ChatApproval }) => ({
	toolName: approval?.tool_name ?? "billing action",
	toolArgs:
		approval?.tool_args && typeof approval.tool_args === "object"
			? (approval.tool_args as Record<string, unknown>)
			: undefined,
	preview: approval?.preview,
	env: approval?.env,
});

const defaultApprovalActionDeps: ApprovalActionDeps = {
	approveAndRun,
	cancelApproval: ({ approvalId, providerUserId }) =>
		chatApprovalRepo.cancel({ approvalId, db, providerUserId }),
	editActionMessage: async ({ content, event }) => {
		await event.adapter.editMessage?.(event.threadId, event.messageId, content);
	},
	getApproval: ({ approvalId }) => chatApprovalRepo.get({ approvalId, db }),
	logger: rootLogger,
};

const cardStatusForApproval = ({
	status,
}: {
	status?: string;
}): ApprovalCardStatus => {
	if (status === "approved" || status === "cancelled" || status === "running")
		return status;
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

	try {
		deps.logger.info("Received approval action", {
			event: "leaf.approval_action_received",
			approval_id: approvalId,
			action: event.actionId,
			data: { provider_user_id: providerUserId },
		});
		const details = detailsFromApproval({
			approval: await deps.getApproval({ approvalId }),
		});
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
				const current = await deps.getApproval({ approvalId });
				await deps.editActionMessage({
					content: approvalStatusCard({
						status: cardStatusForApproval({ status: current?.status }),
						...details,
					}),
					event,
				});
				return;
			}
			await deps.editActionMessage({
				content: approvalStatusCard({ status: "cancelled", ...details }),
				event,
			});
			deps.logger.info("Cancelled approval", {
				event: "leaf.approval_cancelled",
				approval_id: approvalId,
				tool: details.toolName,
			});
			return;
		}

		await deps.editActionMessage({
			content: approvalStatusCard({ status: "running", ...details }),
			event,
		});
		const result = await deps.approveAndRun({ approvalId, providerUserId });
		deps.logger.info("Completed approval action", {
			event: "leaf.approval_completed",
			approval_id: approvalId,
			status: isErrorResult(result) ? "failed" : "approved",
			tool: details.toolName,
		});
		await deps.editActionMessage({
			content: approvalStatusCard({
				status: isErrorResult(result) ? "failed" : "approved",
				...details,
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
				status: cardStatusForApproval({ status: current?.status }),
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
