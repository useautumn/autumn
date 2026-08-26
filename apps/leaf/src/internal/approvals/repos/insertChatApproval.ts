import crypto from "node:crypto";
import { type AppEnv, type ChatProvider, chatApprovals } from "@autumn/shared";
import { addMinutes } from "date-fns";
import type { ChatDb } from "../../../lib/db.js";
import { normalizeToolName } from "../../agentRuntime/tools/toolPolicy.js";
import {
	chatApprovalWritesRepo,
	type InsertApprovalWrite,
} from "./chatApprovalWritesRepo.js";

const APPROVAL_TTL_MINUTES = 15;

/** The primary write (position 0) is derived from the top-level tool fields;
 * `groupedWrites` carries only the withheld rest, in execution order. */
export type InsertChatApprovalData = {
	approveOptionId?: string;
	channelId: string;
	childSessionIds?: ReadonlyArray<string>;
	denyOptionId?: string;
	env: AppEnv;
	groupedWrites?: ReadonlyArray<InsertApprovalWrite>;
	harness: "eve";
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
	const steps: InsertApprovalWrite[] = [
		{
			denyOptionId: data.denyOptionId,
			preview: data.preview,
			requestId: data.toolCallId,
			toolArgs: data.toolArgs,
			toolName: data.toolName,
		},
		...(data.groupedWrites ?? []),
	];
	await db.transaction(async (tx) => {
		await tx.insert(chatApprovals).values({
			id,
			org_id: data.orgId,
			provider: data.provider,
			workspace_id: data.workspaceId,
			channel_id: data.channelId,
			provider_user_id: data.providerUserId,
			env: data.env,
			harness: data.harness,
			run_id: data.runId,
			tool_call_id: data.toolCallId,
			tool_name: normalizeToolName(data.toolName),
			tool_args: data.toolArgs,
			preview: data.preview,
			status: "pending",
			child_session_ids: data.childSessionIds
				? [...data.childSessionIds]
				: null,
			approve_option_id: data.approveOptionId,
			deny_option_id: data.denyOptionId,
			created_at: Date.now(),
			expires_at: addMinutes(Date.now(), APPROVAL_TTL_MINUTES).getTime(),
		});
		await chatApprovalWritesRepo.insert({
			approvalId: id,
			db: tx as unknown as ChatDb,
			steps,
		});
	});
	return id;
};
