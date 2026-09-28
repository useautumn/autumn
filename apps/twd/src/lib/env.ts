import { z } from "zod";

const TwdEnvSchema = z.object({
	TWD_DATABASE_URL: z.string().min(1),
	TWD_PORT: z.coerce.number().default(4100),
	/** Public origin of this daemon; Stripe Connect webhooks + worker callbacks target it. */
	TWD_PUBLIC_URL: z.string().url().default("http://localhost:4100"),
	/** Comma-separated Stripe platform secret keys. The ONLY key source. */
	TW_V3_KEYS: z.string().default(""),
	GOOGLE_CLIENT_ID: z.string().default(""),
	GOOGLE_CLIENT_SECRET: z.string().default(""),
	/** HMAC secret for session cookies. */
	TWD_SESSION_SECRET: z.string().default("dev-only-insecure-secret"),
	GITHUB_WEBHOOK_SECRET: z.string().default(""),
	/** Token the ingress map + worker callbacks authenticate with. */
	TWD_INGRESS_TOKEN: z.string().default("dev-ingress-token"),
	/** Local dev only: skip auth and act as this @useautumn.com email. */
	TWD_DEV_AUTH_EMAIL: z.string().optional(),
});

export type TwdEnv = z.infer<typeof TwdEnvSchema>;

let twdEnv: TwdEnv | undefined;
export const getTwdEnv = (): TwdEnv => {
	twdEnv ??= TwdEnvSchema.parse(process.env);
	return twdEnv;
};
