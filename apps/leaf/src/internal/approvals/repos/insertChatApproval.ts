import crypto from "node:crypto";
import { type AppEnv, type ChatProvider, chatApprovals } from "@autumn/shared";
import { addMinutes } from "date-fns";
import { normalizeToolName } from "../../../agent/tools/toolPolicy.js";
import type { ChatDb } from "../../../lib/db.js";

const APPROVAL_TTL_MINUTES = 15;

export type InsertChatApprovalData = {
	channelId: string;
	env: AppEnv;
	orgId: string;
	preview?: unknown;
	provider: ChatProvider;
	providerUserId: string;
	runId?: string;
	toolArgs: Record<string, unknown>;
	toolCallId?: string;
	toolName: string;
	workspaceId: string;
};

export const insertChatApproval = async ({
	data,
	db,
}: {
	data: InsertChatApprovalData;
	db: ChatDb;
}) => {
	const id = `chat_app_${crypto.randomUUID().replace(/-/g, "")}`;
	await db.insert(chatApprovals).values({
		id,
		org_id: data.orgId,
		provider: data.provider,
		workspace_id: data.workspaceId,
		channel_id: data.channelId,
		provider_user_id: data.providerUserId,
		env: data.env,
		run_id: data.runId,
		tool_call_id: data.toolCallId,
		tool_name: normalizeToolName(data.toolName),
		tool_args: data.toolArgs,
		preview: data.preview,
		status: "pending",
		created_at: Date.now(),
		expires_at: addMinutes(Date.now(), APPROVAL_TTL_MINUTES).getTime(),
	});
	return id;
};
