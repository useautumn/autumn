import type { ActionEvent } from "chat";
import { db } from "../../../../lib/db.js";
import { logger } from "../../../../lib/logger.js";
import { approvalPayloadModal } from "../../../../ui/blocks.js";
import { chatApprovalRepo } from "../../repos/chatApprovalRepo.js";

/** Opens a modal showing the exact tool arguments behind an approval card. */
export const handleViewPayloadAction = async (event: ActionEvent) => {
	const approvalId = event.value;
	if (!approvalId) return;

	try {
		const approval = await chatApprovalRepo.get({ approvalId, db });
		if (!approval) {
			logger.warn("Payload requested for unknown approval", {
				event: "leaf.approval_payload_missing",
				approval_id: approvalId,
			});
			return;
		}
		await event.openModal(
			approvalPayloadModal({
				env: approval.env,
				toolArgs:
					approval.tool_args && typeof approval.tool_args === "object"
						? (approval.tool_args as Record<string, unknown>)
						: undefined,
				toolName: approval.tool_name,
			}),
		);
		logger.info("Opened approval payload modal", {
			event: "leaf.approval_payload_viewed",
			approval_id: approvalId,
			tool: approval.tool_name,
		});
	} catch (error) {
		logger.error("[chat] Could not open approval payload modal", error, {
			event: "leaf.approval_payload_failed",
			approval_id: approvalId,
		});
	}
};
