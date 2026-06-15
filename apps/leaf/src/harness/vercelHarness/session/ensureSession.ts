import { AppEnv } from "@autumn/shared";
import { all } from "better-all";
import type { ThreadRef } from "../../../agent/runMessage/types.js";
import type { ChatDb } from "../../../lib/db.js";
import { buildThreadKey } from "../../common/threadKey.js";
import { vercelHarnessRepo } from "../repos/vercelHarnessRepo.js";

/** Persisted metadata for a thread's Vercel-harness session. The live sandbox +
 * HarnessAgent session handles are rebuilt each turn by the engine. */
export type VercelHarnessSessionRef = {
	braintrustParent?: string;
	env: AppEnv;
	newSession: boolean;
	resumeState?: unknown;
	sessionId: string;
	threadKey: string;
};

export const getVercelHarnessSession = async ({
	db,
	env,
	orgId,
	thread,
}: {
	db: ChatDb;
	env: AppEnv;
	orgId: string;
	thread: ThreadRef;
}): Promise<VercelHarnessSessionRef | undefined> => {
	const threadKey = buildThreadKey({ env, thread });
	const existing = await vercelHarnessRepo.getSession({
		db,
		env,
		orgId,
		threadKey,
	});
	if (!existing) return undefined;
	return {
		braintrustParent: existing.braintrustParent,
		env,
		newSession: false,
		resumeState: existing.resumeState,
		sessionId: existing.sessionId,
		threadKey,
	};
};

export const findVercelHarnessSessionForThread = async ({
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
			return getVercelHarnessSession({ db, env: AppEnv.Live, orgId, thread });
		},
		async sandbox() {
			return getVercelHarnessSession({
				db,
				env: AppEnv.Sandbox,
				orgId,
				thread,
			});
		},
	});
	return sessions.sandbox ?? sessions.live;
};
