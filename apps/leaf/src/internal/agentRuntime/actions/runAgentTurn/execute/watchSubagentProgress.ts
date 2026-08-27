import { logger } from "../../../../../lib/logger.js";
import {
	EveStreamIdleTimeoutError,
	streamEveEvents,
} from "../../../eve/client.js";
import {
	displayEveToolLabel,
	isTerminalEveEventType,
	labelForAction,
} from "../../../eve/events.js";
import type { EveAuthContext, EveSessionRef } from "../../../eve/types.js";
import { isSilentTool } from "../../../tools/toolPolicy.js";
import {
	CHILD_RELAY_IDLE_TIMEOUT_MS,
	MAX_CHILD_IDLE_RECONNECTS,
} from "../../../turnBudget.js";
import type { EveEventContext } from "./applyEveEvent.js";

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

	const startedAt = Date.now();
	let childEndReason: string | undefined;

	const relayPass = async () => {
		for await (const event of streamEveEvents({
			auth,
			idleTimeoutMs: CHILD_RELAY_IDLE_TIMEOUT_MS,
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
				isTerminalEveEventType(event.type)
			) {
				childEndReason = event.type;
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
			if (signal.aborted) {
				childEndReason = "aborted";
				return;
			}
		}
		childEndReason = "reconnects_exhausted";
	};

	void relay()
		.finally(() => {
			const exhausted = childEndReason === "reconnects_exhausted";
			logger[exhausted ? "error" : "info"]("Eve subagent relay ended", {
				event: "leaf.eve_child_relay_ended",
				data: {
					child_session_id: childSessionId,
					events_seen: childSession.state.streamIndex,
					reason: childEndReason ?? "stream_closed",
					relay_ms: Date.now() - startedAt,
					session_id: session.sessionId,
				},
			});
			onChildEnded?.();
		})
		.catch((error) => {
			if (error instanceof EveStreamIdleTimeoutError) return;
			if (error instanceof Error && error.name === "AbortError") return;
			logger.debug("Subagent progress relay ended", {
				event: "leaf.subagent_progress_relay_ended",
				data: { child_session_id: childSessionId, error: String(error) },
			});
		});
};
