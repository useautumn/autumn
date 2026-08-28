import type { TurnSource } from "./types/turnSource.ts";

export type SimulatorFacts = Record<string, string>;

const FALLBACK_ANSWER =
	"I don't have specific requirements for that — use best practices.";
const CLOSING_ANSWER = "No more details from me — go ahead and finish.";

/**
 * Deterministic user simulator: the prompt opens; each agent QUESTION is
 * answered from the answers card by keyword trigger (first match wins,
 * fallback otherwise). A non-question reply ends the conversation. No LLM —
 * zero variance across skill rewrites.
 */
export const simulatedUser = ({
	prompt,
	answers,
	maxAnswers = 4,
}: {
	prompt: string;
	answers: SimulatorFacts;
	maxAnswers?: number;
}): TurnSource => {
	let opened = false;
	let answered = 0;
	return {
		maxUserTurns: maxAnswers + 2,
		next: (lastAgentText) => {
			if (!opened) {
				opened = true;
				return prompt;
			}
			if (!lastAgentText.includes("?")) return null;
			answered += 1;
			if (answered > maxAnswers) return null;
			if (answered === maxAnswers) return CLOSING_ANSWER;
			const question = lastAgentText.toLowerCase();
			const matched = Object.entries(answers).find(([trigger]) =>
				question.includes(trigger.toLowerCase()),
			);
			return matched ? matched[1] : FALLBACK_ANSWER;
		},
	};
};
