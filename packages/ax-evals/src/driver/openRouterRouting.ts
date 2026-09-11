/** Routes the agent through OpenRouter's Anthropic-compatible endpoint when
 * the model is an OpenRouter ID ("openai/gpt-5.6-terra"). Bare Anthropic IDs
 * ("claude-haiku-4-5") keep subscription auth. */

export const isOpenRouterModel = (model: string): boolean =>
	model.includes("/");

/** Header auth note: routed runs bill OpenRouter by design, so only flag an
 * API key as unexpected on non-routed runs. */
export const describeAuthSource = ({
	authSource,
	model,
}: {
	authSource?: string;
	model?: string;
}): { text: string; unexpected: boolean } => {
	if (model && isOpenRouterModel(model))
		return { text: "openrouter", unexpected: false };
	if (authSource === "none")
		return { text: "subscription auth", unexpected: false };
	return { text: `⚠ API KEY (${authSource ?? "unknown"})`, unexpected: true };
};

export const openRouterAgentEnv = (): Record<string, string> => {
	const apiKey = process.env.OPENROUTER_API_KEY;
	if (!apiKey) {
		throw new Error(
			"OPENROUTER_API_KEY is not set — required for OpenRouter model IDs (with a '/')",
		);
	}
	return {
		ANTHROPIC_BASE_URL: "https://openrouter.ai/api",
		ANTHROPIC_AUTH_TOKEN: apiKey,
		// Must be explicitly empty (not unset) or Claude Code can fall back to
		// authenticating against Anthropic directly.
		ANTHROPIC_API_KEY: "",
	};
};
