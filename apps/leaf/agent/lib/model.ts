import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";

const resolveModel = (value: string | undefined) => {
	if (!value) return undefined;
	const [provider, ...rest] = value.split("/");
	const model = rest.join("/");
	if (provider === "openai" && model) return openai(model);
	if (provider === "anthropic" && model) return anthropic(model);
	return value;
};

/** One model resolution for every leaf agent. `EVE_MODEL_<AGENT>` overrides a
 * single agent ("openai/gpt-5-mini", "anthropic/claude-haiku-4-5"); EVE_MODEL
 * (gateway string) and EVE_ANTHROPIC_MODEL move everyone together. */
export const leafModel = (agent?: string) =>
	resolveModel(
		agent ? process.env[`EVE_MODEL_${agent.toUpperCase()}`] : undefined,
	) ??
	process.env.EVE_MODEL ??
	(process.env.EVE_OPENAI_MODEL
		? openai(process.env.EVE_OPENAI_MODEL)
		: anthropic(process.env.EVE_ANTHROPIC_MODEL ?? "claude-sonnet-5"));

export const leafReasoning = "minimal" as const;
