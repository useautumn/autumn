/**
 * Whether a finished turn left the user anything. Eve can end a turn cleanly
 * while parked on an unanswered request: the run wakes, says nothing, and the
 * thread would silently wedge unless the caller treats that as a failure.
 */
export const eveTurnProducedOutput = ({
	catalogDecision,
	text,
}: {
	catalogDecision?: unknown;
	text?: string;
}) => Boolean(text?.trim() || catalogDecision);
