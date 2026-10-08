import type { Env } from "../types";

/** Shared Capy project keys an env may receive; anything else in QA_SHARED_ENV is ignored. */
const SHARED_ENV_KEYS = [
	"STRIPE_SANDBOX_SECRET_KEY",
	"STRIPE_SANDBOX_CLIENT_ID",
	"STRIPE_SANDBOX_WEBHOOK_SECRET",
	"SVIX_API_KEY",
	"OPENROUTER_API_KEY",
	"ANTHROPIC_API_KEY",
	"RESEND_API_KEY",
	"POSTHOG_API_KEY",
	"SLACK_CLIENT_ID",
	"SLACK_CLIENT_SECRET",
	"SLACK_SIGNING_SECRET",
	"SLACK_BOT_TOKEN",
];

export function sharedEnv({ env }: { env: Env }): Record<string, string> {
	const all = JSON.parse(env.QA_SHARED_ENV ?? "{}") as Record<string, string>;
	return Object.fromEntries(
		SHARED_ENV_KEYS.flatMap((key) => (all[key] ? [[key, all[key]]] : [])),
	);
}
