import Anthropic from "@anthropic-ai/sdk";
import type { ChatProvider } from "@autumn/shared";
import {
	type LeafApprovalStatus,
	type LeafUiMessage,
	sessionEventsToUiMessages,
	type TimestampedMessage,
} from "../../harness/claudeManaged/session/sessionEventsToUiMessages.js";
import { chatApprovalRepo } from "../../internal/approvals/repos/chatApprovalRepo.js";
import type { ChatDb } from "../../lib/db.js";
import { parsePreviewPayload } from "../../ui/previewContent.js";

const client = new Anthropic();

const toApprovalStatus = (status: string): LeafApprovalStatus => {
	if (status === "approved") return "approved";
	if (status === "pending") return "pending";
	return "rejected";
};

/** Replay a dashboard thread from its CMA session (text + tool steps) merged with
 * historical approval cards from `chat_approvals`, interleaved by timestamp. */
export const buildWebHistory = async ({
	channelId,
	db,
	orgId,
	provider,
	sessionId,
	workspaceId,
}: {
	channelId: string;
	db: ChatDb;
	orgId: string;
	provider: ChatProvider;
	sessionId: string;
	workspaceId: string;
}): Promise<LeafUiMessage[]> => {
	const [timeline, approvals] = await Promise.all([
		sessionEventsToUiMessages({ client, sessionId }),
		chatApprovalRepo.listForChannel({
			channelId,
			db,
			orgId,
			provider,
			workspaceId,
		}),
	]);

	const ordered = [...timeline].sort((a, b) => a.ts - b.ts);
	const standalones: TimestampedMessage[] = [];

	// Attach each approval to its turn's assistant message (the latest assistant
	// message at or before the approval) so the message ends in the card — same
	// shape the live stream produces, so narration folds under "Worked".
	for (const approval of approvals) {
		const part = {
			data: {
				approvalId: approval.id,
				preview: parsePreviewPayload(approval.preview),
				status: toApprovalStatus(approval.status),
			},
			id: approval.id,
			type: "data-approval" as const,
		};
		const owner = [...ordered]
			.reverse()
			.find(
				(item) =>
					item.msg.role === "assistant" && item.ts <= approval.created_at,
			);
		if (owner) {
			owner.msg.parts.push(part);
		} else {
			standalones.push({
				msg: {
					id: `approval-${approval.id}`,
					parts: [part],
					role: "assistant",
				},
				ts: approval.created_at,
			});
		}
	}

	return [...ordered, ...standalones]
		.sort((a, b) => a.ts - b.ts)
		.map((item) => item.msg);
};
