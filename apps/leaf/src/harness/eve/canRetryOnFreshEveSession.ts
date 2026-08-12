/**
 * Whether a reply-less turn can be re-run on a brand-new session. A session
 * that streamed nothing never saw the message; one that streamed events and
 * then went quiet already did whatever it did, and replaying would redo it.
 */
export const canRetryOnFreshEveSession = ({
	alreadyRetried,
	sessionIsNew,
	streamedAnyEvent,
}: {
	alreadyRetried: boolean;
	sessionIsNew: boolean;
	streamedAnyEvent: boolean;
}) => !(streamedAnyEvent || alreadyRetried || sessionIsNew);
