import { AppEnv, harnessSessions } from "@autumn/shared";
import { all } from "better-all";
import { and, desc, eq, isNull, like } from "drizzle-orm";
import type { ThreadRef } from "../../agent/runMessage/types.js";
import type { ChatDb } from "../../lib/db.js";
import { buildThreadKey } from "../common/threadKey.js";
import {
	type EveSessionRef,
	type EveSessionState,
	eveSessionStateSchema,
} from "./types.js";

const parseState = (value: unknown): EveSessionState | undefined => {
	const parsed = eveSessionStateSchema.safeParse(value);
	return parsed.success ? parsed.data : undefined;
};

const rowToSession = ({
	env,
	row,
	threadKey,
}: {
	env: AppEnv;
	row?: typeof harnessSessions.$inferSelect;
	threadKey: string;
}): EveSessionRef | undefined => {
	if (!row) return undefined;
	const state = parseState(row.resume_state);
	if (!state) return undefined;
	return {
		env,
		newSession: false,
		sessionId: row.session_id,
		state,
		threadKey,
	};
};

export const getEveSession = async ({
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
	const row = await db.query.harnessSessions.findFirst({
		where: and(
			eq(harnessSessions.org_id, orgId),
			eq(harnessSessions.env, env),
			eq(harnessSessions.thread_key, threadKey),
		),
	});
	return rowToSession({ env, row, threadKey });
};

export const findEveSessionForThread = async ({
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
			return getEveSession({ db, env: AppEnv.Live, orgId, thread });
		},
		async sandbox() {
			return getEveSession({ db, env: AppEnv.Sandbox, orgId, thread });
		},
	});
	return sessions.sandbox ?? sessions.live;
};

export const getEveSessionBySessionId = async ({
	db,
	orgId,
	sessionId,
}: {
	db: ChatDb;
	orgId: string;
	sessionId: string;
}) => {
	const row = await db.query.harnessSessions.findFirst({
		where: and(
			eq(harnessSessions.org_id, orgId),
			eq(harnessSessions.session_id, sessionId),
		),
	});
	if (!row) return undefined;
	const env = row.env === AppEnv.Live ? AppEnv.Live : AppEnv.Sandbox;
	return rowToSession({ env, row, threadKey: row.thread_key });
};

export const upsertEveSession = async ({
	db,
	env,
	orgId,
	sessionId,
	state,
	threadKey,
}: {
	db: ChatDb;
	env: AppEnv;
	orgId: string;
	sessionId: string;
	state: EveSessionState;
	threadKey: string;
}) => {
	await db
		.insert(harnessSessions)
		.values({
			org_id: orgId,
			env,
			thread_key: threadKey,
			session_id: sessionId,
			resume_state: state,
			updated_at: Date.now(),
		})
		.onConflictDoUpdate({
			target: [
				harnessSessions.org_id,
				harnessSessions.env,
				harnessSessions.thread_key,
			],
			set: {
				session_id: sessionId,
				resume_state: state,
				updated_at: Date.now(),
			},
		});
};

export const listHarnessSessions = async ({
	db,
	env,
	limit,
	orgId,
	threadKeyPrefix,
}: {
	db: ChatDb;
	env: AppEnv;
	limit: number;
	orgId: string;
	threadKeyPrefix: string;
}) =>
	db
		.select({
			thread_key: harnessSessions.thread_key,
			title: harnessSessions.title,
			updated_at: harnessSessions.updated_at,
		})
		.from(harnessSessions)
		.where(
			and(
				eq(harnessSessions.org_id, orgId),
				eq(harnessSessions.env, env),
				like(harnessSessions.thread_key, `${threadKeyPrefix}%`),
			),
		)
		.orderBy(desc(harnessSessions.updated_at))
		.limit(limit);

export const deleteHarnessSessionsByPrefix = async ({
	db,
	env,
	orgId,
	threadKeyPrefix,
}: {
	db: ChatDb;
	env: AppEnv;
	orgId: string;
	threadKeyPrefix: string;
}) => {
	await db
		.delete(harnessSessions)
		.where(
			and(
				eq(harnessSessions.org_id, orgId),
				eq(harnessSessions.env, env),
				like(harnessSessions.thread_key, `${threadKeyPrefix}%`),
			),
		);
};

/** Guarded on IS NULL so a client re-sending "first message" never retitles. */
export const setHarnessSessionTitleIfEmpty = async ({
	db,
	env,
	orgId,
	threadKey,
	title,
}: {
	db: ChatDb;
	env: AppEnv;
	orgId: string;
	threadKey: string;
	title: string;
}) => {
	await db
		.update(harnessSessions)
		.set({ title })
		.where(
			and(
				eq(harnessSessions.org_id, orgId),
				eq(harnessSessions.env, env),
				eq(harnessSessions.thread_key, threadKey),
				isNull(harnessSessions.title),
			),
		);
};

export const updateEveSessionState = async ({
	db,
	env,
	orgId,
	state,
	threadKey,
}: {
	db: ChatDb;
	env: AppEnv;
	orgId: string;
	state: EveSessionState;
	threadKey: string;
}) => {
	await db
		.update(harnessSessions)
		.set({ resume_state: state, updated_at: Date.now() })
		.where(
			and(
				eq(harnessSessions.org_id, orgId),
				eq(harnessSessions.env, env),
				eq(harnessSessions.thread_key, threadKey),
			),
		);
};
