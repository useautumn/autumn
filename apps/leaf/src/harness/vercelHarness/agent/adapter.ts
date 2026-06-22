import { createClaudeCode } from "@ai-sdk/harness-claude-code";
import { env as chatEnv } from "../../../lib/env.js";
import { vercelHarnessConfig } from "../config.js";

// Maps the swappable adapter name to its factory. Only claudeCode is installed;
// add codex/pi here when wired.
const adapterFactories = {
	claudeCode: () =>
		createClaudeCode({
			auth: chatEnv.ANTHROPIC_API_KEY
				? { anthropic: { apiKey: chatEnv.ANTHROPIC_API_KEY } }
				: undefined,
			model: vercelHarnessConfig.model,
		}),
} as const;

export const buildAdapter = () => {
	const factory =
		adapterFactories[
			vercelHarnessConfig.adapter as keyof typeof adapterFactories
		];
	if (!factory) {
		throw new Error(
			`Vercel harness adapter "${vercelHarnessConfig.adapter}" is not wired`,
		);
	}
	return factory();
};
