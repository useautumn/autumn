/** Every line the agent says on its own behalf, in one place: Slack and web
 * render the same failures and had already drifted to two spellings of some. */

// Excluded on purpose: text written TO the model (deny reasons, withdrawal
// notes) is prompting, and short status labels belong with the surface.

export const NO_REPLY_MESSAGE =
	"I couldn't produce a reply to that — please send it again.";

export const AGENT_UNREACHABLE_MESSAGE =
	"Eve stopped responding mid-turn — please send your message again.";

export const WAITING_FOR_INPUT_MESSAGE = "Eve is waiting for input.";

export const CREDENTIAL_WITHHELD_MESSAGE =
	"[response withheld: it appeared to contain a credential]";

// Approvals

export const APPROVAL_SESSION_GONE_MESSAGE =
	"This conversation's session has ended, so this request can't be applied — send it again and I'll start fresh.";

export const APPROVAL_STILL_OPEN_MESSAGE =
	"there's still an open approval card on this thread — approve or discard it before sending a new message";

export const CATALOG_DECISION_NEEDED_MESSAGE =
	"A couple of decisions are needed before this can be applied:";

export const ACTION_FAILED_MESSAGE = "The action failed.";

export const PREVIEW_UNAVAILABLE_MESSAGE =
	"⚠️ Could not load the billing preview — approve only if the request below is what you expect.";

export const APPROVAL_NOT_EXECUTED_MESSAGE =
	"The approved action was not executed — the agent's session is waiting on other pending approvals. Please retry.";

export const QUESTION_ANSWER_FAILED_MESSAGE =
	"I couldn't record that answer — it may already be resolved. Reply in the thread instead.";

export const questionAnswerFailedWithDetail = (detail: string) =>
	`I couldn't record that answer (${detail}). Reply in the thread instead.`;

// Run lifecycle

export const RUN_TIMED_OUT_MESSAGE =
	"That run took too long and was stopped. Send your message again to continue.";

export const RUN_STOPPED_FOR_TIME_MESSAGE =
	"_I stopped because the run was taking too long. Send a new message to continue._";

export const runStoppedByUserNotice = (stoppedBy?: string) =>
	`_Stopped${stoppedBy ? ` by <@${stoppedBy}>` : ""}. Nothing further was run._`;

export const RUN_ALREADY_FINISHED_MESSAGE = "_This run already finished._";

// Failures

export const POST_FORMATTING_FAILED_MESSAGE =
	"I hit a formatting error posting that reply — the run itself may have succeeded. Ask me to summarize where things stand.";

export const TRANSIENT_CONNECTION_MESSAGE =
	"I hit a temporary connection problem — please send that again.";

export const GENERIC_FAILURE_MESSAGE =
	"Something went wrong — please try again.";

export const genericFailureWithDetail = (detail: string) =>
	`Something went wrong: ${detail} — please try again.`;

const ERROR_NOTICE_MAX = 160;

/** Maps a caught error to the one line the user sees; transport internals
 * never leak — they collapse to the transient-connection message. */
export const errorNotice = ({
	error,
	isTransient,
}: {
	error: unknown;
	isTransient: (error: unknown) => boolean;
}) => {
	const message = error instanceof Error ? error.message : String(error);
	if (/invalid_blocks/i.test(message)) return POST_FORMATTING_FAILED_MESSAGE;
	if (/timed out|timeout/i.test(message)) return RUN_TIMED_OUT_MESSAGE;
	if (isTransient(error)) return TRANSIENT_CONNECTION_MESSAGE;
	const detail = message.replace(/\s+/g, " ").trim().slice(0, ERROR_NOTICE_MAX);
	return detail ? genericFailureWithDetail(detail) : GENERIC_FAILURE_MESSAGE;
};
