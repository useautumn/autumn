export const isOpenRouterModel = (model: string): boolean =>
	model.includes("/");

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
		ANTHROPIC_API_KEY: "",
	};
};
