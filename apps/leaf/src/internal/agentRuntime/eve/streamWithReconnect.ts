import { ms } from "@autumn/shared";
import { logger } from "../../../lib/logger.js";
import { EveStreamDisconnectedError, streamEveEvents } from "./client.js";
import type { EveEvent } from "./eveEventSchemas.js";
import type { EveAuthContext, EveSessionRef } from "./types.js";

const RECONNECT_DELAY_MS = ms.seconds(0.5);
const MAX_RECONNECTS = 5;

/** streamEveEvents with transparent reconnection at the session's current
 * streamIndex — consumers must advance it per event or reconnects replay. */
export async function* streamEveEventsWithReconnect({
	auth,
	idleTimeoutMs,
	session,
	signal,
}: {
	auth: EveAuthContext;
	idleTimeoutMs?: number;
	session: EveSessionRef;
	signal?: AbortSignal;
}): AsyncGenerator<EveEvent> {
	let disconnects = 0;
	while (true) {
		try {
			for await (const event of streamEveEvents({
				auth,
				idleTimeoutMs,
				session,
				signal,
			})) {
				disconnects = 0;
				yield event;
			}
			return;
		} catch (error) {
			if (!(error instanceof EveStreamDisconnectedError)) throw error;
			disconnects += 1;
			const data = {
				attempt: disconnects,
				session_id: session.sessionId,
				stream_index: session.state.streamIndex,
			};
			if (disconnects >= MAX_RECONNECTS) {
				logger.error("Eve stream reconnects exhausted", {
					event: "leaf.eve_stream_reconnect_exhausted",
					data,
					error,
				});
				throw error;
			}
			logger.warn("Eve stream disconnected; reconnecting", {
				event: "leaf.eve_stream_disconnected",
				data,
				error,
			});
			await new Promise((resolve) => setTimeout(resolve, RECONNECT_DELAY_MS));
		}
	}
}
