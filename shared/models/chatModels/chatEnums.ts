export const CHAT_AUTH_MODES = [
	"per_user",
	"restricted",
	"unrestricted",
] as const;

export type ChatAuthMode = (typeof CHAT_AUTH_MODES)[number];

export const ChatAuthMode = {
	PerUser: "per_user",
	Restricted: "restricted",
	Unrestricted: "unrestricted",
} as const satisfies Record<string, ChatAuthMode>;

export const CHAT_REPLY_MODES = ["all_messages", "mentions_only"] as const;

/** How the agent treats replies in a thread it has joined: answer every one,
 * or only those that @-mention it. */
export type ChatReplyMode = (typeof CHAT_REPLY_MODES)[number];

export const ChatReplyMode = {
	AllMessages: "all_messages",
	MentionsOnly: "mentions_only",
} as const satisfies Record<string, ChatReplyMode>;
