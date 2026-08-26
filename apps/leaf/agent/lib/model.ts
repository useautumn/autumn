import { anthropic } from "@ai-sdk/anthropic";
import { createOpenAI, openai } from "@ai-sdk/openai";
import type { LeafAgentConnection } from "./toolAllowlists.js";

type ModelFamily = {
	/** Honours an OpenRouter `cache_control` breakpoint on the system message.
	 * Eve only marks anthropic-direct models, so without this the static prefix
	 * is re-sent uncached: measured 1/7 cache hits in prod versus 109,086 of
	 * 109,093 tokens cached once the breakpoint is added. */
	cacheControlOnSystem?: boolean;
	/** First-party OpenRouter backends. Default routing spreads across
	 * resellers whose time-to-first-token spikes to ~11s; pinning held the
	 * measured worst case to ~2s. */
	openrouterProviders?: readonly string[];
};

/** The one table describing model families. Keyed by the segment after any
 * `openrouter/` prefix, so `google/x` and `openrouter/google/x` share an entry. */
const MODEL_FAMILIES: Record<string, ModelFamily> = {
	anthropic: {},
	google: {
		cacheControlOnSystem: true,
		openrouterProviders: ["google-vertex", "google-ai-studio"],
	},
	// xAI serves grok itself and caches the prefix automatically; adding a
	// breakpoint measured worse ($0.024/call vs $0.009), so neither flag.
	"x-ai": {},
};

const familyOf = (value: string): ModelFamily | undefined =>
	MODEL_FAMILIES[value.replace(/^openrouter\//, "").split("/")[0] ?? ""];

type ChatBody = {
	messages?: Array<{ content?: unknown; role?: string }>;
	[key: string]: unknown;
};

/** OpenRouter reads only the LAST breakpoint for Gemini, and treats the system
 * message as immutable — so one marker on the system prompt caches the whole
 * static prefix. Anything dynamic must live in a later message. */
const markSystemForCaching = (body: ChatBody) => {
	const system = body.messages?.find((message) => message.role === "system");
	if (!system || typeof system.content !== "string") return;
	system.content = [
		{
			cache_control: { type: "ephemeral" },
			text: system.content,
			type: "text",
		},
	];
};

/** Eve has no passthrough for OpenRouter's vendor fields, so the request body
 * is rewritten on the way out: provider pinning plus the cache breakpoint. */
const withOpenrouterRequestTuning = (model: string): typeof fetch => {
	const family = familyOf(model);
	if (!family?.openrouterProviders && !family?.cacheControlOnSystem) {
		return fetch;
	}
	const tuned: typeof fetch = (input, init) => {
		if (!init?.body) return fetch(input, init);
		const body = JSON.parse(String(init.body)) as ChatBody;
		if (family.openrouterProviders) {
			body.provider = {
				allow_fallbacks: true,
				order: [...family.openrouterProviders],
			};
		}
		if (family.cacheControlOnSystem) {
			markSystemForCaching(body);
			// Without this OpenRouter omits token accounting, so traces report
			// zero cached tokens and the cache looks broken when it is not.
			body.usage = { include: true };
		}
		return fetch(input, { ...init, body: JSON.stringify(body) });
	};
	tuned.preconnect = fetch.preconnect;
	return tuned;
};

// .chat pins chat-completions — OpenRouter does not serve the responses API.
const openrouter = (model: string) =>
	createOpenAI({
		apiKey: process.env.OPENROUTER_API_KEY,
		baseURL: "https://openrouter.ai/api/v1",
		fetch: withOpenrouterRequestTuning(model),
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

/** Eve only attaches cache breakpoints to anthropic-direct models, so an
 * override caches only if its family is listed above — either because we inject
 * a breakpoint or because the provider caches on its own. Warn for the rest. */
const warnWhenPromptCacheDisabled = (
	agent: LeafAgentConnection,
	value: string | undefined,
) => {
	if (!value || value.startsWith("anthropic/")) return;
	if (familyOf(value)) return;
	console.warn(
		`[leaf/model] ${agent}: model override "${value}" re-sends the static prefix uncached on every turn — expect slower, costlier turns.`,
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
