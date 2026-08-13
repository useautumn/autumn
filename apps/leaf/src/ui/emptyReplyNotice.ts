/** What to say when a turn came back with nothing at all to show. */
export const emptyReplyNotice = ({ sessionDead }: { sessionDead?: boolean }) =>
	sessionDead
		? "I lost my working session for this thread — please send that message again and I'll pick it up on a fresh one."
		: "I couldn't produce a reply to that — please send it again.";
