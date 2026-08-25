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

/** Eve enables prompt caching only for anthropic-direct model objects — a
 * gateway string or OpenRouter model silently pays full price for the ~40k
 * static prefix on every turn. Warn loudly so overrides can't regress it. */
const warnWhenPromptCacheDisabled = (
	agent: LeafAgentConnection,
	value: string | undefined,
) => {
	if (!value || value.startsWith("anthropic/")) return;
	console.warn(
		`[leaf/model] ${agent}: model override "${value}" disables Anthropic prompt caching on the static prefix — expect slower, costlier turns.`,
	);
};

/** One model resolution for every leaf agent. `EVE_MODEL_<AGENT>` overrides a
 * single agent ("openai/gpt-5-mini", "anthropic/claude-haiku-4-5"); EVE_MODEL
 * (gateway string) and EVE_ANTHROPIC_MODEL move everyone together. */
export const leafModel = (agent: LeafAgentConnection) => {
	const override =
		process.env[`EVE_MODEL_${agent.toUpperCase()}`] ?? process.env.EVE_MODEL;
	warnWhenPromptCacheDisabled(agent, override);
	return (
		resolveModel(process.env[`EVE_MODEL_${agent.toUpperCase()}`]) ??
		resolveModel(process.env.EVE_MODEL) ??
		(process.env.EVE_OPENAI_MODEL
			? openai(process.env.EVE_OPENAI_MODEL)
			: anthropic(process.env.EVE_ANTHROPIC_MODEL ?? "claude-sonnet-5"))
	);
};

// Routing needs no deliberation; "none" disables thinking blocks entirely.
const REASONING_BY_AGENT: Record<LeafAgentConnection, "low" | "none"> = {
	billing: "low",
	catalog: "low",
	investigator: "low",
	orchestrator: "none",
};

export const leafReasoning = (agent: LeafAgentConnection) =>
	REASONING_BY_AGENT[agent];

const DEFAULT_OPENROUTER_CONTEXT_WINDOW_TOKENS = 1_000_000;

/** Eve resolves context windows from AI Gateway metadata, which has no entries
 * for OpenRouter models — supply the window explicitly to keep compaction alive. */
export const leafModelContextWindowTokens = (agent: LeafAgentConnection) => {
	const value =
		process.env[`EVE_MODEL_${agent.toUpperCase()}`] ?? process.env.EVE_MODEL;
	if (!value?.startsWith("openrouter/")) return undefined;
	const configured = Number(process.env.EVE_MODEL_CONTEXT_WINDOW ?? "");
	return configured > 0 ? configured : DEFAULT_OPENROUTER_CONTEXT_WINDOW_TOKENS;
};
