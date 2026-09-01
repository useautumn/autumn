import type { Topic } from "../topicWords.ts";

/** What the simulated user knows: topic → the reply given when the agent's
 * question mentions that topic (word lists live in topicWords.ts). */
export type UserAnswers = Partial<Record<Topic, string>>;

/** One topic the agent asked about, and on which user message (1-based) the
 * reply went out. */
export type AskedTopic = {
	topic: string;
	userTurn: number;
};
