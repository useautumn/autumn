import type { ActionEvent, ModalSubmitEvent } from "chat";
import { isFuture } from "date-fns";
import { db } from "../../../../lib/db.js";
import { logger } from "../../../../lib/logger.js";
import { dispatchSlackAgentMessage } from "../../../../providers/slack/actions/dispatchSlackAgentMessage.js";
import { approvalDetailsModal } from "../../../../ui/blocks.js";
import {
	applyAttachBillingEdits,
	attachBillingEditsSchema,
} from "../../domain/attachBillingEdits.js";
import { chatApprovalRepo } from "../../repos/chatApprovalRepo.js";
import {
	publicToolArgs,
	toolRequestFromArgs,
} from "../../utils/toolRequest.js";

const editableApproval = async ({
	approvalId,
	providerUserId,
}: {
	approvalId: string;
	providerUserId: string;
}) => {
	const approval = await chatApprovalRepo.get({ approvalId, db });
	return approval?.status === "pending" &&
		isFuture(approval.expires_at) &&
		approval.provider_user_id === providerUserId &&
		approval.tool_name === "attach"
		? approval
		: undefined;
};

export const handleEditApprovalDetailsAction = async (event: ActionEvent) => {
	const approvalId = event.value;
	if (!approvalId) return;
	const approval = await editableApproval({
		approvalId,
		providerUserId: event.user.userId,
	});
	if (!approval) return;

	await event.openModal(
		approvalDetailsModal({
			approvalId,
			toolArgs: publicToolArgs(approval.tool_args),
		}),
	);
};

export const handleEditApprovalDetailsSubmit = async (
	event: ModalSubmitEvent,
) => {
	const parsed = attachBillingEditsSchema.safeParse(event.values);
	if (!parsed.success) {
		return {
			action: "errors" as const,
			errors: { billing: "Choose valid billing settings." },
		};
	}
	const approvalId = event.privateMetadata;
	const thread = event.relatedThread;
	if (!(approvalId && thread)) return { action: "clear" as const };
	const approval = await editableApproval({
		approvalId,
		providerUserId: event.user.userId,
	});
	if (!approval) {
		return {
			action: "errors" as const,
			errors: { billing: "This approval is no longer editable." },
		};
	}

	const request = toolRequestFromArgs(publicToolArgs(approval.tool_args)) ?? {};
	const updated = applyAttachBillingEdits({ edits: parsed.data, request });
	if (!updated.success) {
		return {
			action: "errors" as const,
			errors: { billing: "These settings are not valid for this request." },
		};
	}
	// The user chose these billing settings by hand, so they override the
	// skill's defaults (which would otherwise re-enable immediate provisioning
	// or invoice mode on the rebuilt request).
	const text = [
		"Preview this exact attach request and request approval again.",
		"Do not add, remove, or change any field — in particular keep `enable_plan_immediately`, `invoice_mode`, and `redirect_mode` exactly as given; they are the user's explicit choices and override the default billing settings.",
		JSON.stringify(updated.data),
	].join("\n");

	void dispatchSlackAgentMessage({
		channelId: thread.channelId,
		clientContext: {
			approvalEdit: { request: updated.data, toolName: "attach" },
		},
		providerUserId: event.user.userId,
		raw: { team_id: approval.workspace_id },
		target: thread,
		text,
		threadId: thread.id,
	}).catch((error) => {
		logger.error("Could not update approval details", error, {
			event: "leaf.approval_details_update_failed",
			approval_id: approvalId,
		});
	});

	return { action: "clear" as const };
};
