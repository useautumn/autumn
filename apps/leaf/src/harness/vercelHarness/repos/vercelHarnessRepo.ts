import { type AppEnv, harnessSessions } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { ChatDb } from "../../../lib/db.js";

type Key = { db: ChatDb; env: AppEnv; orgId: string; threadKey: string };

const whereKey = ({ env, orgId, threadKey }: Omit<Key, "db">) =>
	and(
		eq(harnessSessions.org_id, orgId),
		eq(harnessSessions.env, env),
		eq(harnessSessions.thread_key, threadKey),
	);

export const vercelHarnessRepo = {
	getSession: async ({ db, env, orgId, threadKey }: Key) => {
		const row = await db.query.harnessSessions.findFirst({
			where: whereKey({ env, orgId, threadKey }),
		});
		if (!row) return undefined;
		return {
			braintrustParent: row.braintrust_parent ?? undefined,
			resumeState: row.resume_state ?? undefined,
			sessionId: row.session_id,
		};
	},

	upsertSession: async ({
		db,
		env,
		orgId,
		resumeState,
		sessionId,
		threadKey,
	}: Key & {
		resumeState?: unknown;
		sessionId: string;
	}) => {
		await db
			.insert(harnessSessions)
			.values({
				env,
				org_id: orgId,
				resume_state: resumeState ?? null,
				session_id: sessionId,
				thread_key: threadKey,
			})
			.onConflictDoUpdate({
				target: [
					harnessSessions.org_id,
					harnessSessions.env,
					harnessSessions.thread_key,
				],
				set: {
					resume_state: resumeState ?? null,
					session_id: sessionId,
					updated_at: Date.now(),
				},
			});
	},

	getBySessionId: async ({
		db,
		sessionId,
	}: {
		db: ChatDb;
		sessionId: string;
	}) =>
		await db.query.harnessSessions.findFirst({
			where: eq(harnessSessions.session_id, sessionId),
		}),

	setResumeState: async ({
		db,
		env,
		orgId,
		resumeState,
		threadKey,
	}: Key & { resumeState: unknown }) => {
		await db
			.update(harnessSessions)
			.set({ resume_state: resumeState ?? null, updated_at: Date.now() })
			.where(whereKey({ env, orgId, threadKey }));
	},

	setBraintrustParent: async ({
		db,
		env,
		orgId,
		parent,
		threadKey,
	}: Key & { parent: string }) => {
		await db
			.update(harnessSessions)
			.set({ braintrust_parent: parent, updated_at: Date.now() })
			.where(whereKey({ env, orgId, threadKey }));
	},
};
