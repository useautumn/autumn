import type { AutumnLogger } from "@autumn/logging";
import type { ChatApproval, ChatInstallation } from "@autumn/shared";
import type { ActionEvent } from "chat";
import { toolLabel } from "../agent/toolPolicy.js";
import { logger as rootLogger } from "../lib/logger.js";
import type { AgentOutput } from "../types.js";
import { approvalCard, approvalStatusCard } from "../ui/blocks.js";
import {
	finishLoading,
	type LoadingState,
	type ReplyTarget,
} from "../ui/progress.js";
import { approvalErrorResult } from "./errors.js";
import { approvalRequestFromOutput } from "./request.js";
import {
	approveAndRun,
	cancelApproval,
	createApproval,
	getApproval,
	isErrorResult,
} from "./store.js";

export const postApprovalRequest = async ({
	channelId,
	installation,
	loading,
	logAction,
	logger = rootLogger,
	output,
	providerUserId,
	target,
}: {
	channelId: string;
	installation: ChatInstallation;
	loading: LoadingState;
	logAction: (message: string) => Promise<void> | void;
	logger?: AutumnLogger;
	output: AgentOutput;
	providerUserId: string;
	target: ReplyTarget;
}) => {
	const approval = approvalRequestFromOutput(output);
	if (!approval) return false;

	const approvalId = await createApproval({
		orgId: installation.org_id,
		provider: installation.provider,
		workspaceId: installation.workspace_id,
		channelId,
		providerUserId,
		...approval,
	});

	await logAction(`Waiting for approval: ${toolLabel(approval.toolName)}`);
	logger.info("Created approval request", {
		event: "leaf.approval_created",
		context: {
			env: approval.env,
			org_id: installation.org_id,
		},
		approval_id: approvalId,
		tool: approval.toolName,
	});
	await finishLoading(target, loading, "Preview ready.");
	await target.post(
		approvalCard({
			id: approvalId,
			env: approval.env,
			toolName: approval.toolName,
			toolArgs: approval.toolArgs,
			preview: approval.preview,
		}),
	);
	return true;
};

const detailsFromApproval = (approval?: ChatApproval) => ({
	toolName: approval?.tool_name ?? "billing action",
	toolArgs:
		approval?.tool_args && typeof approval.tool_args === "object"
			? (approval.tool_args as Record<string, unknown>)
			: undefined,
	preview: approval?.preview,
	env: approval?.env,
});

const editActionMessage = async (
	event: ActionEvent,
	content: Parameters<NonNullable<ActionEvent["adapter"]["editMessage"]>>[2],
) => {
	await event.adapter.editMessage?.(event.threadId, event.messageId, content);
};

type ApprovalActionDeps = {
	approveAndRun: typeof approveAndRun;
	cancelApproval: typeof cancelApproval;
	editActionMessage: typeof editActionMessage;
	getApproval: typeof getApproval;
	logger: Pick<AutumnLogger, "error" | "info" | "warn">;
};

const defaultApprovalActionDeps = {
	approveAndRun,
	cancelApproval,
	editActionMessage,
	getApproval,
	logger: rootLogger,
} satisfies ApprovalActionDeps;

const cardStatusForApproval = (
	status?: string,
): "approved" | "cancelled" | "failed" | "running" => {
	if (status === "approved" || status === "cancelled" || status === "running")
		return status;
	return "failed";
};

export const handleApprovalActionWithDeps = async (
	event: ActionEvent,
	deps: ApprovalActionDeps = defaultApprovalActionDeps,
) => {
	if (!event.value) return;

	try {
		deps.logger.info("Received approval action", {
			event: "leaf.approval_action_received",
			approval_id: event.value,
			action: event.actionId,
			data: {
				provider_user_id: event.user.userId,
			},
		});
		const details = detailsFromApproval(await deps.getApproval(event.value));
		if (event.actionId === "cancel_billing_action") {
			const cancelled = await deps.cancelApproval(
				event.value,
				event.user.userId,
			);
			if (!cancelled) {
				deps.logger.warn("Approval cancellation ignored", {
					event: "leaf.approval_cancel_ignored",
					approval_id: event.value,
				});
				const current = await deps.getApproval(event.value);
				await deps.editActionMessage(
					event,
					approvalStatusCard({
						status: cardStatusForApproval(current?.status),
						...details,
					}),
				);
				return;
			}
			await deps.editActionMessage(
				event,
				approvalStatusCard({ status: "cancelled", ...details }),
			);
			deps.logger.info("Cancelled approval", {
				event: "leaf.approval_cancelled",
				approval_id: event.value,
				tool: details.toolName,
			});
			return;
		}

		await deps.editActionMessage(
			event,
			approvalStatusCard({ status: "running", ...details }),
		);
		const result = await deps.approveAndRun(event.value, event.user.userId);
		deps.logger.info("Completed approval action", {
			event: "leaf.approval_completed",
			approval_id: event.value,
			status: isErrorResult(result) ? "failed" : "approved",
			tool: details.toolName,
		});
		await deps.editActionMessage(
			event,
			approvalStatusCard({
				status: isErrorResult(result) ? "failed" : "approved",
				...details,
				result,
			}),
		);
	} catch (error) {
		deps.logger.error("[chat] Approval action failed", error, {
			event: "leaf.approval_failed",
			approval_id: event.value,
			action: event.actionId,
		});
		const current = await deps.getApproval(event.value);
		await deps.editActionMessage(
			event,
			approvalStatusCard({
				status: cardStatusForApproval(current?.status),
				...detailsFromApproval(current),
				result: approvalErrorResult(error),
			}),
		);
	}
};

export const handleApprovalAction = async (event: ActionEvent) =>
	handleApprovalActionWithDeps(event);
