import type Anthropic from "@anthropic-ai/sdk";
import { AppEnv } from "@autumn/shared";
import { all } from "better-all";
import type { ThreadRef } from "../../../agent/runMessage/types.js";
import type { ChatDb } from "../../../lib/db.js";
import { buildThreadKey } from "../../common/threadKey.js";
import { cmaRepo } from "../repos/claudeManagedRepo.js";

export type ClaudeManagedSessionRef = {
	braintrustParent?: string;
	env: AppEnv;
	newSession: boolean;
	sessionId: string;
	threadKey: string;
};

export const getClaudeManagedSession = async ({
	db,
	env,
	orgId,
	thread,
	userId,
}: {
	db: ChatDb;
	env: AppEnv;
	orgId: string;
	thread: ThreadRef;
	userId?: string;
}) => {
	const threadKey = buildThreadKey({ env, thread, userId });
	const existingSession = await cmaRepo.getSession({
		db,
		env,
		orgId,
		threadKey,
	});
	if (existingSession) {
		return {
			braintrustParent: existingSession.braintrustParent,
			env,
			newSession: false,
			sessionId: existingSession.sessionId,
			threadKey,
		} satisfies ClaudeManagedSessionRef;
	}
};

export const findClaudeManagedSessionForThread = async ({
	db,
	orgId,
	thread,
	userId,
}: {
	db: ChatDb;
	orgId: string;
	thread: ThreadRef;
	userId?: string;
}) => {
	const sessions = await all({
		async live() {
			return getClaudeManagedSession({
				db,
				env: AppEnv.Live,
				orgId,
				thread,
				userId,
			});
		},
		async sandbox() {
			return getClaudeManagedSession({
				db,
				env: AppEnv.Sandbox,
				orgId,
				thread,
				userId,
			});
		},
	});
	return sessions.sandbox ?? sessions.live;
};

export const createClaudeManagedSession = async ({
	agentId,
	client,
	db,
	env,
	environmentId,
	memoryStoreId,
	orgId,
	thread,
	userId,
	vaultId,
}: {
	agentId: string;
	client: Anthropic;
	db: ChatDb;
	env: AppEnv;
	environmentId: string;
	memoryStoreId?: string;
	orgId: string;
	thread: ThreadRef;
	userId?: string;
	vaultId: string;
}) => {
	const threadKey = buildThreadKey({ env, thread, userId });

	const session = await client.beta.sessions.create({
		agent: agentId,
		environment_id: environmentId,
		metadata: { env, orgId, threadKey },
		...(memoryStoreId
			? {
					resources: [
						{
							access: "read_write" as const,
							instructions:
								"Org context across threads. Use and inspect this memory autonomously when it is relevant. Save durable facts like customers, preferences, and decisions.",
							memory_store_id: memoryStoreId,
							type: "memory_store" as const,
						},
					],
				}
			: {}),
		title: `${thread.provider}:${thread.threadId}`,
		vault_ids: [vaultId],
	});
	await cmaRepo.upsertSession({
		db,
		env,
		orgId,
		sessionId: session.id,
		threadKey,
	});

	return {
		braintrustParent: undefined,
		env,
		newSession: true,
		sessionId: session.id,
		threadKey,
	} satisfies ClaudeManagedSessionRef;
};

export const ensureClaudeManagedSession = async ({
	agentId,
	client,
	db,
	env,
	environmentId,
	memoryStoreId,
	orgId,
	thread,
	userId,
	vaultId,
}: {
	agentId: string;
	client: Anthropic;
	db: ChatDb;
	env: AppEnv;
	environmentId: string;
	memoryStoreId?: string;
	orgId: string;
	thread: ThreadRef;
	userId?: string;
	vaultId: string;
}) =>
	(await getClaudeManagedSession({ db, env, orgId, thread, userId })) ??
	createClaudeManagedSession({
		agentId,
		client,
		db,
		env,
		environmentId,
		memoryStoreId,
		orgId,
		thread,
		userId,
		vaultId,
	});
