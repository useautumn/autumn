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
