import type { Expectation } from "../../grading/types/expectation.ts";
import type { UserAnswers } from "../../simulator/types/userAnswers.ts";

/** The starting world of a step-tier case: state the environment instead of
 * making the agent rediscover (and pay for) it every run. */
export type Scenario = {
	/** appended to the agent's system prompt, e.g. "atmn is installed, the key
	 * is in .env, the org is empty — your job is modeling the config" */
	primer?: string;
	/** replace atmn's network commands (pull/push/login) with instant
	 * deterministic local replies; preview and the rest stay real */
	stubAtmn?: boolean;
};

/** A tau-style LLM-simulated user: goal + private facts brief. */
export type SimulatedUserBrief = {
	/** what this user is trying to get done */
	goal: string;
	/** the private brief, one fact per line — the agent must ask to learn them */
	facts: string;
	maxUserTurns?: number;
};

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
	/** when set, an LLM plays the user from this brief (overrides answers) */
	simulatedUser?: SimulatedUserBrief;
	/** starting world for step-tier cases (primer + stubbed atmn) */
	scenario?: Scenario;
	/** files already in the folder before the agent starts (path → content) */
	existingFiles?: Record<string, string>;
	expect: Expectation[];
	/** a known-correct config used to prove the graders work */
	goldenConfig?: string;
};
