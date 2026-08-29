export type ApprovalReplyIntent =
	| { kind: "approve" }
	| { kind: "cancel" }
	| { kind: "ambiguous" };

const APPROVE_PATTERN =
	/^(?:yes[,!]?\s+)?(?:please\s+|pls\s+)?approved?(?:\s+(?:it|this|that))?$/;
const CANCEL_PATTERN =
	/^(?:please\s+|pls\s+)?(?:cancel|deny|reject|dismiss)(?:\s+(?:it|this|that))?$/;
const DECISION_WORD = /\b(?:approve|cancel|deny|reject|dismiss)\b/;
const SHORT_PHRASE_WORDS = 5;

/** Classifies a thread reply as a decision on the pending card. Numeric answers
 * and short decision-adjacent phrases get guidance rather than a guess; longer
 * text is conversation and never resolves here. */
export const approvalReplyIntent = (
	text: string,
): ApprovalReplyIntent | undefined => {
	const normalized = text
		.trim()
		.toLowerCase()
		.replace(/[.!?…]+$/, "")
		.trim();
	if (!normalized) return undefined;
	if (APPROVE_PATTERN.test(normalized)) return { kind: "approve" };
	if (CANCEL_PATTERN.test(normalized)) return { kind: "cancel" };
	if (/^[12]$/.test(normalized)) return { kind: "ambiguous" };
	const isShort = normalized.split(/\s+/).length <= SHORT_PHRASE_WORDS;
	if (isShort && DECISION_WORD.test(normalized)) return { kind: "ambiguous" };
	return undefined;
};
