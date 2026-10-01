import { z } from "zod";

const DEV_INGRESS_TOKEN = "dev-ingress-token";
const DEV_SESSION_SECRET = "dev-only-insecure-secret";

const TwdEnvSchema = z.object({
	TWD_DATABASE_URL: z.string().min(1),
	TWD_PORT: z.coerce.number().default(4100),
	/** Public origin of this daemon; Stripe Connect webhooks + worker callbacks target it. */
	TWD_PUBLIC_URL: z.string().url().default("http://localhost:4100"),
	/** Comma-separated Stripe platform secret keys. The ONLY key source. */
	/** Optional bootstrap: keys here are imported into the DB on boot (additive). */
	TW_V3_KEYS: z.string().default(""),
	/** stripe-connect shard's dedicated platform key; never pooled, farmed or nuked. */
	SHARD_STRIPE_SANDBOX_KEY: z.string().default(""),
	/** Connect client_id of the SHARD_STRIPE_SANDBOX_KEY platform. */
	SHARD_STRIPE_CLIENT_ID: z.string().default(""),
	/** Encrypts Stripe keys stored in the DB. Changing it makes stored keys unreadable. */
	TWD_KEY_ENCRYPTION_SECRET: z.string().min(32).optional(),
	GOOGLE_CLIENT_ID: z.string().default(""),
	GOOGLE_CLIENT_SECRET: z.string().default(""),
	/** HMAC secret for session cookies. */
	TWD_SESSION_SECRET: z.string().default(DEV_SESSION_SECRET),
	GITHUB_WEBHOOK_SECRET: z.string().default(""),
	/** Token the ingress map + worker callbacks authenticate with. */
	TWD_INGRESS_TOKEN: z.string().default(DEV_INGRESS_TOKEN),
	/** Local dev only: skip auth and act as this @useautumn.com email. */
	TWD_DEV_AUTH_EMAIL: z.string().optional(),
});

export type TwdEnv = z.infer<typeof TwdEnvSchema>;

const DEV_DEFAULTS = {
	TWD_INGRESS_TOKEN: DEV_INGRESS_TOKEN,
	TWD_SESSION_SECRET: DEV_SESSION_SECRET,
} as const;

/** Any non-localhost public URL is a real deployment: the known dev secrets must be overridden. */
const assertNoDevSecrets = (env: TwdEnv) => {
	const host = new URL(env.TWD_PUBLIC_URL).hostname;
	if (host === "localhost" || host === "127.0.0.1") return;
	const leaked = Object.entries(DEV_DEFAULTS)
		.filter(([key, value]) => env[key as keyof typeof DEV_DEFAULTS] === value)
		.map(([key]) => key);
	if (leaked.length > 0)
		throw new Error(
			`${leaked.join(", ")} must be set to a strong secret when TWD_PUBLIC_URL is ${env.TWD_PUBLIC_URL}.`,
		);
};

let twdEnv: TwdEnv | undefined;
export const getTwdEnv = (): TwdEnv => {
	if (!twdEnv) {
		const parsed = TwdEnvSchema.parse(process.env);
		assertNoDevSecrets(parsed);
		twdEnv = parsed;
	}
	return twdEnv;
};
