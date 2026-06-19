import crypto from "node:crypto";
import { slackAdminThreads } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { ChatDb } from "../../../lib/db.js";

type SlackAdminThreadsDb = Pick<ChatDb, "delete" | "insert" | "query">;

export type SlackAdminThreadRef = {
	channelId: string;
	threadId: string;
	workspaceId: string;
};

export type SlackAdminThreadRecord = {
	orgId: string;
	orgSlug?: string;
	targetIdentifier: string;
};

const newThreadId = () =>
	`slack_admin_thread_${crypto.randomUUID().replace(/-/g, "")}`;

export const slackAdminThreadsRepo = {
	getByThread: async ({
		db,
		channelId,
		threadId,
		workspaceId,
	}: SlackAdminThreadRef & {
		db: SlackAdminThreadsDb;
	}): Promise<SlackAdminThreadRecord | null> => {
		const thread = await db.query.slackAdminThreads.findFirst({
			where: and(
				eq(slackAdminThreads.workspace_id, workspaceId),
				eq(slackAdminThreads.channel_id, channelId),
				eq(slackAdminThreads.thread_id, threadId),
			),
		});
		if (!thread) return null;
		return {
			orgId: thread.org_id,
			orgSlug: thread.org_slug ?? undefined,
			targetIdentifier: thread.target_identifier,
		};
	},

	upsert: async ({
		db,
		channelId,
		chatInstallationId,
		orgId,
		orgSlug,
		providerUserId,
		targetIdentifier,
		threadId,
		workspaceId,
	}: SlackAdminThreadRef & {
		chatInstallationId: string;
		db: SlackAdminThreadsDb;
		orgId: string;
		orgSlug?: string | null;
		providerUserId: string;
		targetIdentifier: string;
	}): Promise<SlackAdminThreadRecord> => {
		const now = Date.now();
		const [thread] = await db
			.insert(slackAdminThreads)
			.values({
				id: newThreadId(),
				chat_installation_id: chatInstallationId,
				workspace_id: workspaceId,
				channel_id: channelId,
				thread_id: threadId,
				org_id: orgId,
				org_slug: orgSlug ?? null,
				target_identifier: targetIdentifier,
				created_by_provider_user_id: providerUserId,
				created_at: now,
				updated_at: now,
			})
			.onConflictDoUpdate({
				target: [
					slackAdminThreads.workspace_id,
					slackAdminThreads.channel_id,
					slackAdminThreads.thread_id,
				],
				set: { updated_at: now },
			})
			.returning();

		return {
			orgId: thread.org_id,
			orgSlug: thread.org_slug ?? undefined,
			targetIdentifier: thread.target_identifier,
		};
	},

	deleteByInstallation: async ({
		db,
		chatInstallationId,
	}: {
		db: SlackAdminThreadsDb;
		chatInstallationId: string;
	}) =>
		await db
			.delete(slackAdminThreads)
			.where(eq(slackAdminThreads.chat_installation_id, chatInstallationId)),
};
