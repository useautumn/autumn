import { type AppEnv, cmaMemory, cmaSessions, cmaVaults } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { ChatDb } from "../../../lib/db.js";

// CMA runtime state in the `leaf` schema, scoped by (org_id, env) so one tenant's
// sessions/vaults/memory never collide. The shared agent is a single global resource —
// cached in-memory (ensureLeafResources), not persisted here.
export const cmaRepo = {
	getSession: async ({
		db,
		env,
		orgId,
		threadKey,
	}: {
		db: ChatDb;
		env: AppEnv;
		orgId: string;
		threadKey: string;
	}) => {
		const row = await db.query.cmaSessions.findFirst({
			where: and(
				eq(cmaSessions.org_id, orgId),
				eq(cmaSessions.env, env),
				eq(cmaSessions.thread_key, threadKey),
			),
		});
		if (!row) return undefined;
		return {
			braintrustParent: row.braintrust_parent ?? undefined,
			sessionId: row.session_id,
		};
	},

	upsertSession: async ({
		db,
		env,
		orgId,
		sessionId,
		threadKey,
	}: {
		db: ChatDb;
		env: AppEnv;
		orgId: string;
		sessionId: string;
		threadKey: string;
	}) => {
		await db
			.insert(cmaSessions)
			.values({
				org_id: orgId,
				env,
				thread_key: threadKey,
				session_id: sessionId,
			})
			.onConflictDoUpdate({
				target: [cmaSessions.org_id, cmaSessions.env, cmaSessions.thread_key],
				set: { session_id: sessionId, updated_at: Date.now() },
			});
	},

	setBraintrustParent: async ({
		db,
		env,
		orgId,
		parent,
		threadKey,
	}: {
		db: ChatDb;
		env: AppEnv;
		orgId: string;
		parent: string;
		threadKey: string;
	}) => {
		await db
			.update(cmaSessions)
			.set({ braintrust_parent: parent, updated_at: Date.now() })
			.where(
				and(
					eq(cmaSessions.org_id, orgId),
					eq(cmaSessions.env, env),
					eq(cmaSessions.thread_key, threadKey),
				),
			);
	},

	getVaultId: async ({
		db,
		env,
		orgId,
	}: {
		db: ChatDb;
		env: AppEnv;
		orgId: string;
	}) => {
		const row = await db.query.cmaVaults.findFirst({
			where: and(eq(cmaVaults.org_id, orgId), eq(cmaVaults.env, env)),
		});
		return row?.vault_id;
	},

	upsertVault: async ({
		credentialId,
		db,
		env,
		orgId,
		vaultId,
	}: {
		credentialId: string;
		db: ChatDb;
		env: AppEnv;
		orgId: string;
		vaultId: string;
	}) => {
		await db
			.insert(cmaVaults)
			.values({
				org_id: orgId,
				env,
				vault_id: vaultId,
				credential_id: credentialId,
			})
			.onConflictDoUpdate({
				target: [cmaVaults.org_id, cmaVaults.env],
				set: {
					vault_id: vaultId,
					credential_id: credentialId,
					updated_at: Date.now(),
				},
			});
	},

	getMemoryStoreId: async ({
		db,
		env,
		orgId,
	}: {
		db: ChatDb;
		env: AppEnv;
		orgId: string;
	}) => {
		const row = await db.query.cmaMemory.findFirst({
			where: and(eq(cmaMemory.org_id, orgId), eq(cmaMemory.env, env)),
		});
		return row?.memory_store_id;
	},

	upsertMemory: async ({
		db,
		env,
		memoryStoreId,
		orgId,
	}: {
		db: ChatDb;
		env: AppEnv;
		memoryStoreId: string;
		orgId: string;
	}) => {
		await db
			.insert(cmaMemory)
			.values({ org_id: orgId, env, memory_store_id: memoryStoreId })
			.onConflictDoUpdate({
				target: [cmaMemory.org_id, cmaMemory.env],
				set: { memory_store_id: memoryStoreId, updated_at: Date.now() },
			});
	},
};
