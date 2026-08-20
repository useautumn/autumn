import type { ActionEvent, ModalSubmitEvent } from "chat";
import { isFuture } from "date-fns";
import { db } from "../../../../lib/db.js";
import { logger } from "../../../../lib/logger.js";
import { dispatchSlackAgentMessage } from "../../../../providers/slack/actions/dispatchSlackAgentMessage.js";
import { approvalDetailsModal } from "../../../../ui/blocks.js";
import { withheldWritesFromToolArgs } from "../../../agentRuntime/eve/parkedInput.js";
import { normalizeToolName } from "../../../agentRuntime/tools/toolPolicy.js";
import {
	applyBillingEdits,
	billingEditsSchema,
	billingOptionsFor,
	EDITABLE_BILLING_TOOLS,
	type EditableBillingTool,
} from "../../domain/billingEdits.js";
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
		(EDITABLE_BILLING_TOOLS as ReadonlyArray<string>).includes(
			approval.tool_name,
		)
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
			toolName: approval.tool_name as EditableBillingTool,
		}),
	);
};

export const handleEditApprovalDetailsSubmit = async (
	event: ModalSubmitEvent,
) => {
	const parsed = billingEditsSchema.safeParse(event.values);
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

	// One card can carry a whole batch; the edited settings apply to every
	// attach step so the rebuilt card keeps the full group.
	const steps: Array<{ request: Record<string, unknown>; toolName: string }> =
		[];
	const groupedWrites = [
		{
			input: publicToolArgs(approval.tool_args),
			toolName: approval.tool_name,
		},
		...withheldWritesFromToolArgs(approval.tool_args),
	];
	for (const write of groupedWrites) {
		const stepRequest = toolRequestFromArgs(write.input) ?? {};
		const stepTool = normalizeToolName(write.toolName) as EditableBillingTool;
		if (
			!(EDITABLE_BILLING_TOOLS as ReadonlyArray<string>).includes(stepTool) ||
			!billingOptionsFor(stepTool).includes(parsed.data.billing)
		) {
			steps.push({ request: stepRequest, toolName: write.toolName });
			continue;
		}
		const updated = applyBillingEdits({
			edits: parsed.data,
			request: stepRequest,
			toolName: stepTool,
		});
		if (!updated.success) {
			return {
				action: "errors" as const,
				errors: { billing: "These settings are not valid for this request." },
			};
		}
		steps.push({ request: updated.data, toolName: stepTool });
	}
	// The user chose these billing settings by hand, so they override the
	// skill's defaults (which would otherwise re-enable immediate provisioning
	// or invoice mode on the rebuilt request).
	const text = [
		steps.length > 1
			? `Preview these exact ${steps.length} requests and request approval again, issuing ALL writes together in ONE tool batch so they stay on one approval card.`
			: `Preview this exact ${steps[0]?.toolName ?? "billing"} request and request approval again.`,
		"Do not add, remove, or change any field — in particular keep `enable_plan_immediately`, `invoice_mode`, `proration_behavior`, and `redirect_mode` exactly as given; they are the user's explicit choices and override the default billing settings.",
		...steps.map((step) => `${step.toolName}: ${JSON.stringify(step.request)}`),
	].join("\n");

	void dispatchSlackAgentMessage({
		channelId: thread.channelId,
		clientContext: {
			approvalEdit: { steps, toolName: approval.tool_name },
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
