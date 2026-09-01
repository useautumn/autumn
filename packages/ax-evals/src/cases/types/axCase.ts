import type { Expectation } from "../../grading/types/expectation.ts";
import type { UserAnswers } from "../../simulator/types/userAnswers.ts";

/** One eval case: what the user says, how they answer questions, and what
 * passing looks like. Grouping comes from the folder; the kind of case comes
 * from its expectations. */
export type AxCase = {
	name: string;
	/** the user's opening message */
	prompt: string;
	/** extra user messages sent in order after the prompt */
	followUpMessages?: string[];
	/** what the user knows, by topic — answers agent questions that mention it */
	answers?: UserAnswers;
	/** files already in the folder before the agent starts (path → content) */
	existingFiles?: Record<string, string>;
	expect: Expectation[];
	/** a known-correct config used to prove the graders work */
	goldenConfig?: string;
};
