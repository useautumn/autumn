import { type Topic, topicWords } from "./topicWords.ts";
import type { TurnSource } from "./types/turnSource.ts";
import type { AskedTopic, UserAnswers } from "./types/userAnswers.ts";

const FALLBACK_ANSWER =
	"I don't have specific requirements for that — use best practices.";
const CLOSING_ANSWER = "No more details from me — go ahead and finish.";

/**
 * Deterministic user simulator: the prompt opens; each agent QUESTION is
 * answered with the replies for every topic it mentions (combined into one
 * message, each recorded for flow grading), fallback when none match. A
 * non-question reply ends the conversation. No LLM — zero variance across
 * skill rewrites.
 */
export const simulatedUser = ({
	prompt,
	answers,
	maxAnswers = 4,
}: {
	prompt: string;
	answers: UserAnswers;
	maxAnswers?: number;
}): TurnSource => {
	const asked: AskedTopic[] = [];
	let opened = false;
	let answered = 0;
	let userTurn = 0;
	return {
		maxUserTurns: maxAnswers + 2,
		askedTopics: () => asked,
		next: (lastAgentText) => {
			if (!opened) {
				opened = true;
				userTurn = 1;
				return prompt;
			}
			if (!lastAgentText.includes("?")) return null;
			answered += 1;
			if (answered > maxAnswers) return null;
			userTurn += 1;
			if (answered === maxAnswers) return CLOSING_ANSWER;
			const question = lastAgentText.toLowerCase();
			const mentionedTopics = (Object.keys(answers) as Topic[]).filter(
				(topic) =>
					topicWords[topic].some((word) =>
						question.includes(word.toLowerCase()),
					),
			);
			for (const topic of mentionedTopics) asked.push({ topic, userTurn });
			if (mentionedTopics.length === 0) return FALLBACK_ANSWER;
			return mentionedTopics.map((topic) => answers[topic]).join(" ");
		},
	};
};
