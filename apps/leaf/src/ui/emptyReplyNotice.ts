/** What to say when a turn came back with nothing at all to show. */
export const emptyReplyNotice = ({ sessionDead }: { sessionDead?: boolean }) =>
	sessionDead
		? "I lost my working session for this thread and started a clean one — please send that message again."
		: "I couldn't produce a reply to that — please send it again.";
