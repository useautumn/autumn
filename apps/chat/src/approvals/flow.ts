import type { ChatInstallation } from "@autumn/shared";
import type { ActionEvent } from "chat";
import {
	approveAndRun,
	cancelApproval,
	createApproval,
	getApproval,
	isErrorResult,
} from "./store.js";
import { approvalRequestFromOutput } from "./request.js";
import { approvalCard, approvalStatusCard } from "../ui/blocks.js";
import {
	finishLoading,
	type LoadingState,
	type ReplyTarget,
} from "../ui/progress.js";
import { toolLabel } from "../agent/toolPolicy.js";
import type { AgentOutput } from "../types.js";

export const postApprovalRequest = async ({
	channelId,
	installation,
	loading,
	logAction,
	output,
	providerUserId,
	target,
}: {
	channelId: string;
	installation: ChatInstallation;
	loading: LoadingState;
	logAction: (message: string) => Promise<void> | void;
	output: AgentOutput;
	providerUserId: string;
	target: ReplyTarget;
}) => {
	const approval = approvalRequestFromOutput(output);
	if (!approval) return false;

	const approvalId = await createApproval({
		orgId: installation.org_id,
		provider: "slack",
		workspaceId: installation.workspace_id,
		channelId,
		providerUserId,
		...approval,
	});

	await logAction(`Waiting for approval: ${toolLabel(approval.toolName)}`);
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

const approvalDetails = async (id: string) => {
	const approval = await getApproval(id);
	return {
		toolName: approval?.tool_name ?? "billing action",
		toolArgs:
			approval?.tool_args && typeof approval.tool_args === "object"
				? (approval.tool_args as Record<string, unknown>)
				: undefined,
		preview: approval?.preview,
		env: approval?.env,
	};
};

const editActionMessage = async (
	event: ActionEvent,
	content: Parameters<NonNullable<ActionEvent["adapter"]["editMessage"]>>[2],
) => {
	await event.adapter.editMessage?.(event.threadId, event.messageId, content);
};

const cardStatusForApproval = (
	status?: string,
): "approved" | "cancelled" | "failed" | "running" => {
	if (status === "approved" || status === "cancelled" || status === "running")
		return status;
	return "failed";
};

export const handleApprovalAction = async (event: ActionEvent) => {
	if (!event.value) return;

	try {
		const details = await approvalDetails(event.value);
		if (event.actionId === "cancel_billing_action") {
			const cancelled = await cancelApproval(event.value, event.user.userId);
			if (!cancelled) {
				const current = await getApproval(event.value);
				await editActionMessage(
					event,
					approvalStatusCard({
						status: cardStatusForApproval(current?.status),
						...details,
					}),
				);
				return;
			}
			await editActionMessage(
				event,
				approvalStatusCard({ status: "cancelled", ...details }),
			);
			return;
		}

		await editActionMessage(
			event,
			approvalStatusCard({ status: "running", ...details }),
		);
		const result = await approveAndRun(event.value, event.user.userId);
		await editActionMessage(
			event,
			approvalStatusCard({
				status: isErrorResult(result) ? "failed" : "approved",
				...details,
				result,
			}),
		);
	} catch (error) {
		console.error("[chat] Approval action failed", error);
		await editActionMessage(
			event,
			approvalStatusCard({
				status: "failed",
				toolName: "billing action",
			}),
		);
	}
};
