/**
 * Whether a reply-less turn can be re-run on a brand-new session. A session
 * that streamed nothing never saw the message; one that streamed events and
 * then went quiet already did whatever it did, and replaying would redo it.
 * A chip answer never replays: it is a bare option label with no question.
 */
export const canRetryOnFreshEveSession = ({
	alreadyRetried,
	answeringParkedQuestion,
	sessionIsNew,
	streamedAnyEvent,
}: {
	alreadyRetried: boolean;
	answeringParkedQuestion: boolean;
	sessionIsNew: boolean;
	streamedAnyEvent: boolean;
}) =>
	!(
		streamedAnyEvent ||
		alreadyRetried ||
		sessionIsNew ||
		answeringParkedQuestion
	);
