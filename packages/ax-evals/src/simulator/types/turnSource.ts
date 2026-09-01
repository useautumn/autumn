import type { AskedTopic } from "./userAnswers.ts";

/**
 * Supplies user turns to the driver. next() is called before each user turn
 * with the agent's last reply ("" for the opening turn); null ends the
 * conversation. May be async (e.g. an LLM-simulated user).
 */
export type TurnSource = {
	next: (lastAgentText: string) => string | null | Promise<string | null>;
	maxUserTurns: number;
	/** which topics the agent's questions hit, in order */
	askedTopics?: () => AskedTopic[];
};
