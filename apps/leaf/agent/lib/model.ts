import { anthropic } from "@ai-sdk/anthropic";
import { createOpenAI, openai } from "@ai-sdk/openai";
import type { LeafAgentConnection } from "./toolAllowlists.js";

type AgentModel = {
	model?: string;
	reasoning: "low" | "none";
};

const AGENTS: Record<LeafAgentConnection, AgentModel> = {
	billing: {
		model: "openrouter/google/gemini-3.7-flash",
		reasoning: "low",
	},
	catalog: { reasoning: "low" },
	investigator: { reasoning: "low" },
	orchestrator: { model: "openrouter/x-ai/grok-4.20", reasoning: "none" },
};

type ModelFamily = {
	cacheControlOnSystem?: boolean;
	openrouterProviders?: readonly string[];
};

const FAMILIES: Record<string, ModelFamily> = {
	anthropic: {},
	google: {
		cacheControlOnSystem: true,
		openrouterProviders: ["google-vertex", "google-ai-studio"],
	},
	// xAI serves grok itself; adding a breakpoint measured worse.
	"x-ai": {},
};

const familyOf = (model: string): ModelFamily | undefined =>
	FAMILIES[model.replace(/^openrouter\//, "").split("/")[0] ?? ""];

const modelFor = (agent: LeafAgentConnection) =>
	process.env[`EVE_MODEL_${agent.toUpperCase()}`] ??
	process.env.EVE_MODEL ??
	AGENTS[agent].model;

type ChatBody = {
	messages?: Array<{ content?: unknown; role?: string }>;
	[key: string]: unknown;
};

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

// Eve has no passthrough for OpenRouter's vendor fields, so they go on the wire.
const openrouterFetch = (family: ModelFamily): typeof fetch => {
	const tuned: typeof fetch = (input, init) => {
		if (!init?.body) return fetch(input, init);
		const body = JSON.parse(String(init.body)) as ChatBody;
		if (family.openrouterProviders) {
			body.provider = {
				allow_fallbacks: true,
				order: [...family.openrouterProviders],
			};
		}
		if (family.cacheControlOnSystem) markSystemForCaching(body);
		return fetch(input, { ...init, body: JSON.stringify(body) });
	};
	tuned.preconnect = fetch.preconnect;
	return tuned;
};

// .chat pins chat-completions — OpenRouter does not serve the responses API.
const openrouter = (model: string) => {
	const family = familyOf(model);
	return createOpenAI({
		apiKey: process.env.OPENROUTER_API_KEY,
		baseURL: "https://openrouter.ai/api/v1",
		...(family ? { fetch: openrouterFetch(family) } : {}),
	}).chat(model);
};

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

const warnWhenPromptCacheDisabled = (
	agent: LeafAgentConnection,
	model: string | undefined,
) => {
	if (!model || model.startsWith("anthropic/") || familyOf(model)) return;
	console.warn(
		`[leaf/model] ${agent}: model override "${model}" re-sends the static prefix uncached on every turn — expect slower, costlier turns.`,
	);
};

export const leafModel = (agent: LeafAgentConnection) => {
	const model = modelFor(agent);
	warnWhenPromptCacheDisabled(agent, model);
	return (
		resolveModel(model) ??
		(process.env.EVE_OPENAI_MODEL
			? openai(process.env.EVE_OPENAI_MODEL)
			: anthropic(process.env.EVE_ANTHROPIC_MODEL ?? "claude-sonnet-5"))
	);
};

export const leafReasoning = (agent: LeafAgentConnection) =>
	AGENTS[agent].reasoning;

const DEFAULT_OPENROUTER_CONTEXT_WINDOW_TOKENS = 1_000_000;

// The gateway catalog has no OpenRouter entries; without a window eve throws.
export const leafModelContextWindowTokens = (agent: LeafAgentConnection) => {
	if (!modelFor(agent)?.startsWith("openrouter/")) return undefined;
	const configured = Number(process.env.EVE_MODEL_CONTEXT_WINDOW ?? "");
	return configured > 0 ? configured : DEFAULT_OPENROUTER_CONTEXT_WINDOW_TOKENS;
};
