import type { AppEnv } from "@autumn/shared";
import { db } from "../../../../../lib/db.js";
import { logger } from "../../../../../lib/logger.js";
import { EveSessionGoneError } from "../../../eve/client.js";
import { deleteEveSession } from "../../../eve/repo.js";
import type { EveSessionRef } from "../../../eve/types.js";
import { isContinuationTokenAlive } from "../../../eve/world/sessionRun.js";

/** A post on a token eve no longer holds silently starts a new run; drop the
 * row instead so the caller restarts the thread on a fresh session. */
export const assertEveSessionAlive = async ({
	env,
	orgId,
	session,
}: {
	env: AppEnv;
	orgId: string;
	session: EveSessionRef;
}) => {
	const alive = await isContinuationTokenAlive({
		sessionId: session.sessionId,
		token: session.state.continuationToken,
	});
	if (alive !== false) return;
	logger.warn("Eve no longer holds the session's delivery hook", {
		event: "leaf.eve_token_dead",
		data: {
			pending_request_count: session.state.pendingRequests.length,
			session_id: session.sessionId,
			stream_index: session.state.streamIndex,
		},
	});
	await deleteEveSession({
		db,
		env,
		orgId,
		reason: "session_gone",
		sessionId: session.sessionId,
		threadKey: session.threadKey,
	});
	throw new EveSessionGoneError(
		`Eve no longer holds the delivery hook for session ${session.sessionId}`,
	);
};
