import { anthropic } from "@ai-sdk/anthropic";
import { createOpenAI, openai } from "@ai-sdk/openai";
import type { LeafAgentConnection } from "./toolAllowlists.js";

type ModelFamily = {
	// Gemini caches only where a breakpoint is sent: 1/7 hits in prod without
	// one, 109,086 of 109,093 tokens with.
	cacheControlOnSystem?: boolean;
	// Default routing spreads across resellers that spiked to ~11s TTFT.
	openrouterProviders?: readonly string[];
};

// Keyed after any `openrouter/` prefix, so `google/x` and `openrouter/google/x`
// share one entry. Absent means eve caches it already, or nothing can.
const MODEL_FAMILIES: Record<string, ModelFamily> = {
	anthropic: {},
	google: {
		cacheControlOnSystem: true,
		openrouterProviders: ["google-vertex", "google-ai-studio"],
	},
	// xAI serves grok itself and caches on its own; a breakpoint measured worse.
	"x-ai": {},
};

const familyOf = (value: string): ModelFamily | undefined =>
	MODEL_FAMILIES[value.replace(/^openrouter\//, "").split("/")[0] ?? ""];

type ChatBody = {
	messages?: Array<{ content?: unknown; role?: string }>;
	[key: string]: unknown;
};

// OpenRouter reads only the last breakpoint for Gemini and treats the system
// message as immutable, so one marker there caches the whole static prefix.
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
	// OpenRouter omits token accounting unless asked, which reads as a dead cache.
	body.usage = { include: true };
};

const pinProviders = (body: ChatBody, order: readonly string[]) => {
	body.provider = { allow_fallbacks: true, order: [...order] };
};

// Eve has no passthrough for OpenRouter's vendor fields, so the body is
// rewritten on the way out.
const withOpenrouterRequestTuning = (model: string): typeof fetch => {
	const family = familyOf(model);
	if (!(family?.openrouterProviders || family?.cacheControlOnSystem)) {
		return fetch;
	}
	const tuned: typeof fetch = (input, init) => {
		if (!init?.body) return fetch(input, init);
		const body = JSON.parse(String(init.body)) as ChatBody;
		if (family.openrouterProviders) {
			pinProviders(body, family.openrouterProviders);
		}
		if (family.cacheControlOnSystem) markSystemForCaching(body);
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

// An override caches only if its family is listed above; warn for the rest.
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

// Benchmarked on the production payload. Routing (10 cases x 5 reps, bare and
// mid-thread): grok-4.20 50/50 at 0.83s, sonnet-5 45/50 at 4.09s — sonnet asks
// "to confirm?" instead of delegating. Billing (4 attach/update flows):
// gemini-3-flash 12/12 at 2.33s, sonnet-5 12/12 at 17.22s.
const MODEL_BY_AGENT: Partial<Record<LeafAgentConnection, string>> = {
	billing: "openrouter/google/gemini-3-flash-preview",
	orchestrator: "openrouter/x-ai/grok-4.20",
};

const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";

// `EVE_MODEL_<AGENT>` overrides one agent; EVE_MODEL (gateway string) and
// EVE_ANTHROPIC_MODEL move everyone together.
export const leafModel = (agent: LeafAgentConnection) => {
	const override =
		process.env[`EVE_MODEL_${agent.toUpperCase()}`] ??
		process.env.EVE_MODEL ??
		MODEL_BY_AGENT[agent];
	warnWhenPromptCacheDisabled(agent, override);
	return (
		resolveModel(override) ??
		(process.env.EVE_OPENAI_MODEL
			? openai(process.env.EVE_OPENAI_MODEL)
			: anthropic(process.env.EVE_ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL))
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

// Eve reads context windows from AI Gateway metadata, which has no OpenRouter
// entries — without an explicit window it throws at build time.
export const leafModelContextWindowTokens = (agent: LeafAgentConnection) => {
	const value =
		process.env[`EVE_MODEL_${agent.toUpperCase()}`] ??
		process.env.EVE_MODEL ??
		MODEL_BY_AGENT[agent];
	if (!value?.startsWith("openrouter/")) return undefined;
	const configured = Number(process.env.EVE_MODEL_CONTEXT_WINDOW ?? "");
	return configured > 0 ? configured : DEFAULT_OPENROUTER_CONTEXT_WINDOW_TOKENS;
};
