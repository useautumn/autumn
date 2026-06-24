import crypto from "node:crypto";
import {
	type ChatThreadContext,
	type ChatThreadContextSource,
	chatThreadContexts,
} from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { ChatDb } from "../../../lib/db.js";

type ChatThreadContextsDb = Pick<ChatDb, "delete" | "insert" | "query">;

export type ChatThreadRef = {
	channelId: string;
	threadId: string;
	workspaceId: string;
};

const newContextId = () =>
	`chat_thread_ctx_${crypto.randomUUID().replace(/-/g, "")}`;

const toRecord = (context: ChatThreadContext) => ({
	chatInstallationId: context.chat_installation_id,
	orgId: context.org_id,
	orgSlug: context.org_slug ?? undefined,
	source: context.source,
	targetIdentifier: context.target_identifier ?? undefined,
});

export type ChatThreadContextRecord = ReturnType<typeof toRecord>;

export const chatThreadContextsRepo = {
	getByThread: async ({
		db,
		channelId,
		threadId,
		workspaceId,
	}: ChatThreadRef & {
		db: ChatThreadContextsDb;
	}): Promise<ChatThreadContextRecord | null> => {
		const context = await db.query.chatThreadContexts.findFirst({
			where: and(
				eq(chatThreadContexts.workspace_id, workspaceId),
				eq(chatThreadContexts.channel_id, channelId),
				eq(chatThreadContexts.thread_id, threadId),
			),
		});
		return context ? toRecord(context) : null;
	},

	getUnambiguousByChannelThread: async ({
		db,
		channelId,
		threadId,
	}: Pick<ChatThreadRef, "channelId" | "threadId"> & {
		db: ChatThreadContextsDb;
	}): Promise<ChatThreadContextRecord | null> => {
		const contexts = await db.query.chatThreadContexts.findMany({
			where: and(
				eq(chatThreadContexts.channel_id, channelId),
				eq(chatThreadContexts.thread_id, threadId),
			),
			limit: 10,
		});
		if (contexts.length === 0) return null;

		const [first] = contexts;
		if (!first) return null;
		if (
			contexts.every(
				(context) =>
					context.chat_installation_id === first.chat_installation_id &&
					context.org_id === first.org_id,
			)
		) {
			return toRecord(first);
		}

		return null;
	},

	upsert: async ({
		db,
		channelId,
		chatInstallationId,
		orgId,
		orgSlug,
		providerUserId,
		source,
		targetIdentifier,
		threadId,
		workspaceId,
	}: ChatThreadRef & {
		chatInstallationId: string;
		db: ChatThreadContextsDb;
		orgId: string;
		orgSlug?: string | null;
		providerUserId: string;
		source: ChatThreadContextSource;
		targetIdentifier?: string | null;
	}): Promise<ChatThreadContextRecord> => {
		const now = Date.now();
		const [context] = await db
			.insert(chatThreadContexts)
			.values({
				id: newContextId(),
				chat_installation_id: chatInstallationId,
				workspace_id: workspaceId,
				channel_id: channelId,
				thread_id: threadId,
				org_id: orgId,
				org_slug: orgSlug ?? null,
				source,
				target_identifier: targetIdentifier ?? null,
				created_by_provider_user_id: providerUserId,
				created_at: now,
				updated_at: now,
			})
			.onConflictDoUpdate({
				target: [
					chatThreadContexts.workspace_id,
					chatThreadContexts.channel_id,
					chatThreadContexts.thread_id,
				],
				set: {
					chat_installation_id: chatInstallationId,
					org_id: orgId,
					org_slug: orgSlug ?? null,
					source,
					target_identifier: targetIdentifier ?? null,
					updated_at: now,
				},
			})
			.returning();

		if (!context) throw new Error("Could not upsert chat thread context");
		return toRecord(context);
	},

	deleteByInstallation: async ({
		db,
		chatInstallationId,
	}: {
		db: ChatThreadContextsDb;
		chatInstallationId: string;
	}) =>
		await db
			.delete(chatThreadContexts)
			.where(eq(chatThreadContexts.chat_installation_id, chatInstallationId)),
};
