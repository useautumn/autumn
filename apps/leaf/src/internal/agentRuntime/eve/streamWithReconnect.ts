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
				// A recurring idle reaper cuts every quiet gap, so each gap gets a
				// fresh reconnect budget rather than exhausting one shared counter.
				disconnects = 0;
				yield event;
			}
			return;
		} catch (error) {
			if (!(error instanceof EveStreamDisconnectedError)) throw error;
			disconnects += 1;
			logger.warn("Eve stream disconnected; reconnecting", {
				event: "leaf.eve_stream_disconnected",
				data: {
					attempt: disconnects,
					error: error.message,
					session_id: session.sessionId,
					stream_index: session.state.streamIndex,
				},
			});
			if (disconnects >= MAX_RECONNECTS) throw error;
			await new Promise((resolve) => setTimeout(resolve, RECONNECT_DELAY_MS));
		}
	}
}
