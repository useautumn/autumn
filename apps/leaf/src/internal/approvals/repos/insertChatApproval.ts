import crypto from "node:crypto";
import { type AppEnv, type ChatProvider, chatApprovals } from "@autumn/shared";
import { addMinutes } from "date-fns";
import type { ChatDb } from "../../../lib/db.js";
import { normalizeToolName } from "../../agentRuntime/tools/toolPolicy.js";
import {
	chatApprovalStepsRepo,
	type InsertApprovalStep,
} from "./chatApprovalStepsRepo.js";

const APPROVAL_TTL_MINUTES = 15;

export type InsertChatApprovalData = {
	approveOptionId?: string;
	channelId: string;
	childSessionIds?: ReadonlyArray<string>;
	denyOptionId?: string;
	env: AppEnv;
	harness: "eve";
	orgId: string;
	preview?: unknown;
	provider: ChatProvider;
	providerUserId: string;
	runId?: string;
	/** Every write on the card in execution order, primary first. */
	steps?: ReadonlyArray<InsertApprovalStep>;
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
		harness: data.harness,
		run_id: data.runId,
		tool_call_id: data.toolCallId,
		tool_name: normalizeToolName(data.toolName),
		tool_args: data.toolArgs,
		preview: data.preview,
		status: "pending",
		child_session_ids: data.childSessionIds ? [...data.childSessionIds] : null,
		approve_option_id: data.approveOptionId,
		deny_option_id: data.denyOptionId,
		created_at: Date.now(),
		expires_at: addMinutes(Date.now(), APPROVAL_TTL_MINUTES).getTime(),
	});
	if (data.steps?.length) {
		await chatApprovalStepsRepo.insert({
			approvalId: id,
			db,
			steps: data.steps,
		});
	}
	return id;
};
