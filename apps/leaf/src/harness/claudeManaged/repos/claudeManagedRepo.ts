import { type AppEnv, cmaMemory, cmaSessions, cmaVaults } from "@autumn/shared";
import { and, eq, isNull } from "drizzle-orm";
import type { ChatDb } from "../../../lib/db.js";

// Vaults are scoped per-user for web chat; installation-scoped (Slack) rows use
// a NULL user_id. Match NULL with `IS NULL`, not `= ''` (which never matches).
const vaultUserIdWhere = (userId?: string | null) =>
	userId ? eq(cmaVaults.user_id, userId) : isNull(cmaVaults.user_id);

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
		chatInstallationId,
		db,
		env,
		orgId,
		userId = "",
	}: {
		chatInstallationId: string;
		db: ChatDb;
		env: AppEnv;
		orgId: string;
		// Per-user for web chat; "" for installation-scoped (Slack) vaults.
		userId?: string;
	}) => {
		const row = await db.query.cmaVaults.findFirst({
			where: and(
				eq(cmaVaults.chat_installation_id, chatInstallationId),
				eq(cmaVaults.org_id, orgId),
				eq(cmaVaults.env, env),
				vaultUserIdWhere(userId),
			),
		});
		return row?.vault_id;
	},

	getVault: async ({
		chatInstallationId,
		db,
		env,
		orgId,
		userId = "",
	}: {
		chatInstallationId: string;
		db: ChatDb;
		env: AppEnv;
		orgId: string;
		userId?: string;
	}) => {
		const row = await db.query.cmaVaults.findFirst({
			where: and(
				eq(cmaVaults.chat_installation_id, chatInstallationId),
				eq(cmaVaults.org_id, orgId),
				eq(cmaVaults.env, env),
				vaultUserIdWhere(userId),
			),
		});
		return row;
	},

	// Forces the next ensureAutumnVault to resync tokens into the vault.
	markVaultStale: async ({
		chatInstallationId,
		db,
		env,
		orgId,
		userId = "",
	}: {
		chatInstallationId: string;
		db: ChatDb;
		env: AppEnv;
		orgId: string;
		userId?: string;
	}) => {
		await db
			.update(cmaVaults)
			.set({ updated_at: 0 })
			.where(
				and(
					eq(cmaVaults.chat_installation_id, chatInstallationId),
					eq(cmaVaults.org_id, orgId),
					eq(cmaVaults.env, env),
					vaultUserIdWhere(userId),
				),
			);
	},

	upsertVault: async ({
		chatInstallationId,
		credentialId,
		db,
		env,
		orgId,
		userId = "",
		vaultId,
	}: {
		chatInstallationId: string;
		credentialId: string;
		db: ChatDb;
		env: AppEnv;
		orgId: string;
		userId?: string;
		vaultId: string;
	}) => {
		await db
			.insert(cmaVaults)
			.values({
				chat_installation_id: chatInstallationId,
				org_id: orgId,
				env,
				user_id: userId || null,
				vault_id: vaultId,
				credential_id: credentialId,
			})
			.onConflictDoUpdate({
				target: [
					cmaVaults.chat_installation_id,
					cmaVaults.org_id,
					cmaVaults.env,
					cmaVaults.user_id,
				],
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
