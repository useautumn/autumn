/**
 * Whether a finished turn left the user anything. Eve can end a turn cleanly
 * while parked on an unanswered request: the run wakes, says nothing, and the
 * thread would silently wedge unless the caller treats that as a failure.
 */
export const eveTurnProducedOutput = ({
	catalogDecision,
	question,
	suspension,
	text,
}: {
	catalogDecision?: unknown;
	question?: unknown;
	suspension?: unknown;
	text?: string;
}) => Boolean(text?.trim() || catalogDecision || question || suspension);
