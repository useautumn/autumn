import type { AppEnv, ChatProvider } from "@autumn/shared";
import type {
	EveAuthContext,
	EveSessionRef,
} from "../../../internal/agentRuntime/eve/types.js";
import { chatApprovalRepo } from "../../../internal/approvals/repos/chatApprovalRepo.js";
import type { ChatDb } from "../../../lib/db.js";
import { parsePreviewPayload } from "../../../ui/previewContent.js";
import type {
	LeafApprovalStatus,
	LeafUiMessage,
	TimestampedMessage,
} from "../types.js";
import { replayEveThread } from "./replayEveThread.js";

const unwrapRequest = (args: unknown) =>
	args && typeof args === "object" && "request" in args
		? (args as { request: unknown }).request
		: args;

const toApprovalStatus = (status: string): LeafApprovalStatus => {
	if (status === "approved") return "approved";
	if (status === "pending" || status === "running") return "pending";
	return "rejected";
};

export const buildEveWebHistory = async ({
	auth,
	channelId,
	db,
	env,
	orgId,
	provider,
	session,
	workspaceId,
}: {
	auth: EveAuthContext;
	channelId: string;
	db: ChatDb;
	env: AppEnv;
	orgId: string;
	provider: ChatProvider;
	session: EveSessionRef;
	workspaceId: string;
}): Promise<LeafUiMessage[]> => {
	const [timeline, approvals] = await Promise.all([
		replayEveThread({ auth, session }),
		chatApprovalRepo.listForChannel({
			channelId,
			db,
			env,
			orgId,
			provider,
			workspaceId,
		}),
	]);

	const ordered = [...timeline].sort((a, b) => a.ts - b.ts);
	const hasPendingApproval = approvals.some(
		(approval) => toApprovalStatus(approval.status) === "pending",
	);
	if (hasPendingApproval) {
		for (const item of ordered) {
			item.msg.parts = item.msg.parts.filter(
				(part) => part.type !== "data-catalog-decision",
			);
		}
	}
	const standalones: TimestampedMessage[] = [];
	for (const approval of approvals) {
		const part = {
			data: {
				approvalId: approval.id,
				params: unwrapRequest(approval.tool_args),
				preview: parsePreviewPayload(approval.preview),
				status: toApprovalStatus(approval.status),
				toolName: approval.tool_name,
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
