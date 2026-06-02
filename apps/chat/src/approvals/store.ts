import crypto from "node:crypto";
import {
	AppEnv,
	type ChatProvider,
	chatApprovals,
	chatInstallations,
} from "@autumn/shared";
import { addMinutes, isPast } from "date-fns";
import { and, eq, gt } from "drizzle-orm";
import { decrypt } from "../lib/crypto.js";
import { db } from "../lib/db.js";
import { executeAutumnMcpTool } from "../agent/mcp.js";

export const normalizeToolName = (toolName: string) =>
	toolName.replace(/^autumn_/, "");

export const isErrorResult = (result: unknown): boolean =>
	typeof result === "object" && result !== null && "error" in result;

export const createApproval = async ({
	orgId,
	provider,
	workspaceId,
	channelId,
	providerUserId,
	env,
	runId,
	toolCallId,
	toolName,
	toolArgs,
	preview,
}: {
	orgId: string;
	provider: ChatProvider;
	workspaceId: string;
	channelId: string;
	providerUserId: string;
	env: AppEnv;
	runId?: string;
	toolCallId?: string;
	toolName: string;
	toolArgs: Record<string, unknown>;
	preview?: unknown;
}) => {
	const id = `chat_app_${crypto.randomUUID().replace(/-/g, "")}`;
	await db.insert(chatApprovals).values({
		id,
		org_id: orgId,
		provider,
		workspace_id: workspaceId,
		channel_id: channelId,
		provider_user_id: providerUserId,
		env,
		run_id: runId,
		tool_call_id: toolCallId,
		tool_name: normalizeToolName(toolName),
		tool_args: toolArgs,
		preview,
		status: "pending",
		created_at: Date.now(),
		expires_at: addMinutes(Date.now(), 15).getTime(),
	});
	return id;
};

export const cancelApproval = async (id: string, providerUserId: string) => {
	const [claimed] = await db
		.update(chatApprovals)
		.set({
			status: "cancelled",
			decided_at: Date.now(),
			decided_by_provider_user_id: providerUserId,
		})
		.where(and(eq(chatApprovals.id, id), eq(chatApprovals.status, "pending")))
		.returning();
	return claimed;
};

export const getApproval = async (id: string) =>
	await db.query.chatApprovals.findFirst({
		where: eq(chatApprovals.id, id),
	});

export const approveAndRun = async (id: string, providerUserId: string) => {
	const approval = await db.query.chatApprovals.findFirst({
		where: eq(chatApprovals.id, id),
	});
	if (
		!approval ||
		approval.status !== "pending" ||
		isPast(approval.expires_at)
	) {
		throw new Error("Approval is no longer pending");
	}

	const [claimed] = await db
		.update(chatApprovals)
		.set({
			status: "running",
			decided_at: Date.now(),
			decided_by_provider_user_id: providerUserId,
		})
		.where(
			and(
				eq(chatApprovals.id, id),
				eq(chatApprovals.status, "pending"),
				gt(chatApprovals.expires_at, Date.now()),
			),
		)
		.returning();
	if (!claimed) throw new Error("Approval is no longer pending");

	try {
		const installation = await db.query.chatInstallations.findFirst({
			where: and(
				eq(chatInstallations.org_id, claimed.org_id),
				eq(chatInstallations.provider, claimed.provider),
				eq(chatInstallations.workspace_id, claimed.workspace_id),
			),
		});
		if (!installation) throw new Error("Chat installation not found");

		const encryptedKey =
			claimed.env === AppEnv.Live
				? installation.live_api_key
				: installation.sandbox_api_key;
		if (!encryptedKey) throw new Error(`Missing ${claimed.env} API key`);

		const result = await executeAutumnMcpTool({
			apiKey: decrypt(encryptedKey),
			toolName: claimed.tool_name,
			args: claimed.tool_args,
		});
		await db
			.update(chatApprovals)
			.set({
				status: isErrorResult(result) ? "failed" : "approved",
				decided_at: Date.now(),
				decided_by_provider_user_id: providerUserId,
			})
			.where(eq(chatApprovals.id, id));
		return result;
	} catch (error) {
		await db
			.update(chatApprovals)
			.set({
				status: "failed",
				decided_at: Date.now(),
				decided_by_provider_user_id: providerUserId,
			})
			.where(eq(chatApprovals.id, id));
		throw error;
	}
};
