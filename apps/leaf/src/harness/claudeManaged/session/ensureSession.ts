import type Anthropic from "@anthropic-ai/sdk";
import { AppEnv } from "@autumn/shared";
import { all } from "better-all";
import type { ThreadRef } from "../../../agent/runMessage/types.js";
import type { ChatDb } from "../../../lib/db.js";
import { orgMemoryInstructions } from "../../common/instructions/index.js";
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
}: {
	db: ChatDb;
	env: AppEnv;
	orgId: string;
	thread: ThreadRef;
}) => {
	const threadKey = buildThreadKey({ env, thread });
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
}: {
	db: ChatDb;
	orgId: string;
	thread: ThreadRef;
}) => {
	const sessions = await all({
		async live() {
			return getClaudeManagedSession({ db, env: AppEnv.Live, orgId, thread });
		},
		async sandbox() {
			return getClaudeManagedSession({
				db,
				env: AppEnv.Sandbox,
				orgId,
				thread,
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
	vaultId: string;
}) => {
	const threadKey = buildThreadKey({ env, thread });

	const session = await client.beta.sessions.create({
		agent: agentId,
		environment_id: environmentId,
		metadata: { env, orgId, threadKey },
		...(memoryStoreId
			? {
					resources: [
						{
							access: "read_write" as const,
							instructions: orgMemoryInstructions,
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
	vaultId: string;
}) =>
	(await getClaudeManagedSession({ db, env, orgId, thread })) ??
	createClaudeManagedSession({
		agentId,
		client,
		db,
		env,
		environmentId,
		memoryStoreId,
		orgId,
		thread,
		vaultId,
	});
