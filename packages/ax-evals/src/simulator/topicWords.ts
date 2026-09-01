/**
 * The words that signal the agent asked about a topic — one shared vocabulary
 * across every case. A setup only supplies the replies; flow expectations
 * grade by topic name.
 */
export const topicWords = {
	prices: ["price", "cost", "charge", "how much", "$"],
	meteredFeatures: [
		"feature",
		"meter",
		"usage",
		"limit",
		"track",
		"credit",
		"message",
		"included",
		"enforce",
	],
	booleanFeatures: ["on/off", "boolean", "toggle", "flag", "access to", "sso"],
	overage: ["overage", "extra", "run out", "exceed", "go over"],
	trials: ["trial", "free plan", "free tier"],
} as const;

export type Topic = keyof typeof topicWords;
