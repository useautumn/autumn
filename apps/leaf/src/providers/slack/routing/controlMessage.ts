const GREETING_PREFIX = /^(?:hey|hi)\s+/i;
// Slack raw mentions (<@U…>), the chat SDK's normalized form (@U…), the bot's
// display names, and "the bot" — anything a user prefixes when addressing us.
const MENTION_PREFIX =
	/^(?:<@[^>]+>|@[UW][A-Z0-9]{4,}|@?autumn(?:\s+chat(?:\s+local)?)?|(?:this|the)\s+bot)[,:\s-]*/i;
const POLITE_PREFIX =
	/^(?:please\s+|(?:can|could|would)\s+you\s+(?:please\s+)?)/i;

const STOP_KEYWORDS = new Set([
	"abort",
	"cancel",
	"cancel that",
	"stop",
	"stop it",
	"stop now",
	"stop please",
]);

const explicitOptOutPattern =
	/^(?:stop\s+(?:replying|responding|listening|watching|messaging|talking)(?:\s+(?:to|in)\s+(?:this|the)\s+thread)?|(?:do not|don't|dont|never)\s+(?:reply|respond|listen|watch)(?:\s+(?:anymore|again))?|leave\s+(?:this|the)\s+thread|unsubscribe(?:\s+from\s+(?:this|the)\s+thread)?)(?:\s+(?:now|please))?[.!?]*$/i;

export const stripAddressing = (text: string) =>
	text
		.trim()
		.replace(GREETING_PREFIX, "")
		.replace(MENTION_PREFIX, "")
		.replace(POLITE_PREFIX, "")
		.trim();

export type ControlMessage = "opt_out" | "stop";

/** Classifies a message as a control command after stripping how the user
 * addressed the bot; every Slack entry path must consult this first. */
export const controlMessageFrom = (text: string): ControlMessage | null => {
	const stripped = stripAddressing(text);
	if (explicitOptOutPattern.test(stripped)) return "opt_out";
	const keyword = stripped.toLowerCase().replace(/[.!]+$/, "");
	if (STOP_KEYWORDS.has(keyword)) return "stop";
	return null;
};

export const isExplicitOptOut = (text: string) =>
	controlMessageFrom(text) === "opt_out";
