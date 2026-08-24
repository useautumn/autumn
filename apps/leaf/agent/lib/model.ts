import { anthropic } from "@ai-sdk/anthropic";
import { createOpenAI, openai } from "@ai-sdk/openai";
import type { LeafAgentConnection } from "./toolAllowlists.js";

// .chat pins chat-completions — OpenRouter does not serve the responses API.
const openrouter = (model: string) =>
	createOpenAI({
		apiKey: process.env.OPENROUTER_API_KEY,
		baseURL: "https://openrouter.ai/api/v1",
	}).chat(model);

const resolveModel = (value: string | undefined) => {
	if (!value) return undefined;
	const [provider, ...rest] = value.split("/");
	const model = rest.join("/");
	if (provider === "openai" && model) return openai(model);
	if (provider === "anthropic" && model) return anthropic(model);
	if (provider === "openrouter" && model) return openrouter(model);
	// Any other prefix is treated as a Vercel AI Gateway model id string.
	return value;
};

/** One model resolution for every leaf agent. `EVE_MODEL_<AGENT>` overrides a
 * single agent ("openai/gpt-5-mini", "anthropic/claude-haiku-4-5"); EVE_MODEL
 * (gateway string) and EVE_ANTHROPIC_MODEL move everyone together. */
export const leafModel = (agent: LeafAgentConnection) =>
	resolveModel(process.env[`EVE_MODEL_${agent.toUpperCase()}`]) ??
	resolveModel(process.env.EVE_MODEL) ??
	(process.env.EVE_OPENAI_MODEL
		? openai(process.env.EVE_OPENAI_MODEL)
		: anthropic(process.env.EVE_ANTHROPIC_MODEL ?? "claude-sonnet-5"));

const REASONING_BY_AGENT: Record<LeafAgentConnection, "minimal" | "none"> = {
	billing: "minimal",
	catalog: "minimal",
	investigator: "minimal",
	// Routing needs no deliberation: "minimal" still emits thinking blocks
	// before the delegation call; "none" disables them entirely.
	orchestrator: "none",
};

export const leafReasoning = (agent: LeafAgentConnection) =>
	REASONING_BY_AGENT[agent];
