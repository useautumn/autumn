import crypto from "node:crypto";
import { type AppEnv, type ChatProvider, chatApprovals } from "@autumn/shared";
import { addMinutes } from "date-fns";
import { normalizeToolName } from "../../../agent/tools/toolPolicy.js";
import type { AgentHarnessName } from "../../../lib/chatAgentConfig.js";
import type { ChatDb } from "../../../lib/db.js";

const APPROVAL_TTL_MINUTES = 15;

/** What every approval decided on one card has in common — they all come from
 * a single agent turn. */
export type ChatApprovalGroupContext = {
	channelId: string;
	env: AppEnv;
	harness: AgentHarnessName;
	orgId: string;
	provider: ChatProvider;
	providerUserId: string;
	runId?: string;
	workspaceId: string;
};

export type ChatApprovalGroupItem = {
	preview?: unknown;
	toolArgs: Record<string, unknown>;
	toolCallId?: string;
	toolName: string;
};

const newId = (prefix: string) =>
	`${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;

/** Writes one row per gated call, tied together by a shared group id so the
 * user decides them on a single card. */
export const insertChatApprovalGroup = async ({
	db,
	items,
	shared,
}: {
	db: ChatDb;
	items: ChatApprovalGroupItem[];
	shared: ChatApprovalGroupContext;
}) => {
	const groupId = newId("chat_appg");
	const createdAt = Date.now();
	const rows = items.map((item) => ({
		id: newId("chat_app"),
		group_id: groupId,
		org_id: shared.orgId,
		provider: shared.provider,
		workspace_id: shared.workspaceId,
		channel_id: shared.channelId,
		provider_user_id: shared.providerUserId,
		env: shared.env,
		harness: shared.harness,
		run_id: shared.runId,
		tool_call_id: item.toolCallId,
		tool_name: normalizeToolName(item.toolName),
		tool_args: item.toolArgs,
		preview: item.preview,
		status: "pending",
		created_at: createdAt,
		expires_at: addMinutes(createdAt, APPROVAL_TTL_MINUTES).getTime(),
	}));
	await db.insert(chatApprovals).values(rows);
	return { groupId, ids: rows.map((row) => row.id) };
};
