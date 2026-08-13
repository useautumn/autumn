/** The terminal event a reply-less turn ended on, when one arrived at all. */
export type EveEmptyTurnEnding = "completed" | "waiting";

/**
 * Whether a reply-less turn left the session unusable. Its row is the whole
 * dashboard transcript, so drop only a session that never saw the message
 * (streamed nothing) or woke parked on a request nobody can answer — a turn
 * that simply completed without saying anything is benign.
 */
export const shouldDropEveSession = ({
	endedWithoutOutput,
	streamedAnyEvent,
}: {
	endedWithoutOutput?: EveEmptyTurnEnding;
	streamedAnyEvent: boolean;
}) => !streamedAnyEvent || endedWithoutOutput === "waiting";
