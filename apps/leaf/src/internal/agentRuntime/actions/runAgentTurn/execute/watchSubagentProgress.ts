import { ms } from "@autumn/shared";
import { logger } from "../../../../../lib/logger.js";
import { EveStreamIdleTimeoutError } from "../../../eve/client.js";
import { displayEveToolLabel, labelForAction } from "../../../eve/events.js";
import { streamEveEventsWithReconnect } from "../../../eve/streamWithReconnect.js";
import type { EveAuthContext, EveSessionRef } from "../../../eve/types.js";
import { isSilentTool } from "../../../tools/toolPolicy.js";
import type { EveEventContext } from "./applyEveEvent.js";

/** A delegated child can think for minutes between events, so the relay
 * reconnects through quiet windows and ends only when the child session
 * terminates — while it lives, it vouches for the parent turn. */
const CHILD_WATCH_IDLE_TIMEOUT_MS = ms.minutes(2);
const MAX_CHILD_IDLE_RECONNECTS = 10;

/** Relays a delegated child session's live progress — tool starts and partial
 * text — onto the parent turn's status channel, which otherwise freezes on
 * "Working on <specialist>" for the whole delegation. Read-only and best
 * effort: any failure just ends the relay, never the turn. */
export const watchSubagentProgress = ({
	auth,
	childSessionId,
	onAction,
	onChildActivity,
	onChildEnded,
	onReasoning,
	session,
	signal,
}: {
	auth: EveAuthContext;
	childSessionId: string;
	onAction?: EveEventContext["onAction"];
	onChildActivity?: () => void;
	onChildEnded?: () => void;
	onReasoning?: EveEventContext["onReasoning"];
	session: EveSessionRef;
	signal: AbortSignal;
}) => {
	const childSession: EveSessionRef = {
		env: session.env,
		newSession: false,
		sessionId: childSessionId,
		state: { ...session.state, continuationToken: "", streamIndex: 0 },
		threadKey: session.threadKey,
	};

	const relayPass = async () => {
		for await (const event of streamEveEventsWithReconnect({
			auth,
			idleTimeoutMs: CHILD_WATCH_IDLE_TIMEOUT_MS,
			session: childSession,
			signal,
		})) {
			childSession.state.streamIndex += 1;
			onChildActivity?.();
			if (event.type === "actions.requested") {
				for (const action of event.actions) {
					const label = labelForAction(action);
					if (isSilentTool(label)) continue;
					await onAction?.({
						label: displayEveToolLabel(action),
						phase: "started",
						toolName: label,
					});
				}
			}
			if (event.type === "message.appended" && event.messageDelta) {
				onReasoning?.({
					id: `subagent:${childSessionId}`,
					text:
						typeof event.messageSoFar === "string"
							? event.messageSoFar
							: event.messageDelta,
				});
			}
			if (
				event.type === "input.requested" ||
				event.type === "session.completed" ||
				event.type === "session.failed"
			) {
				return true;
			}
		}
		return false;
	};

	/** Quiet is not the end: reopen at the cursor until the child terminates. */
	const relay = async () => {
		for (let attempt = 0; attempt <= MAX_CHILD_IDLE_RECONNECTS; attempt += 1) {
			try {
				if (await relayPass()) return;
			} catch (error) {
				if (!(error instanceof EveStreamIdleTimeoutError)) throw error;
			}
			if (signal.aborted) return;
		}
	};

	void relay()
		.finally(() => onChildEnded?.())
		.catch((error) => {
			if (error instanceof EveStreamIdleTimeoutError) return;
			if (error instanceof Error && error.name === "AbortError") return;
			logger.debug("Subagent progress relay ended", {
				event: "leaf.subagent_progress_relay_ended",
				data: { child_session_id: childSessionId, error: String(error) },
			});
		});
};
