import { createAnthropic } from "@ai-sdk/anthropic";

export const anthropicClient = process.env.ANTHROPIC_API_KEY
	? createAnthropic({
			apiKey: process.env.ANTHROPIC_API_KEY,
		})
	: undefined;
