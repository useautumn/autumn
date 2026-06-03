import { z } from "zod";

const optionalString = z.preprocess(
	(value) => (value === "" ? undefined : value),
	z.string().min(1).optional(),
);

const envSchema = z
	.object({
		AUTUMN_MCP_URL: z.string().min(1).default("http://localhost:3099/mcp"),
		BETTER_AUTH_SECRET: optionalString,
		BETTER_AUTH_URL: optionalString,
		CHAT_MODEL: z.string().min(1).default("anthropic/claude-sonnet-4-6"),
		CHAT_NAME: z.string().min(1).default("Autumn"),
		CHAT_STATE_DATABASE_URL: optionalString,
		CHAT_STATE_SECRET: optionalString,
		CLIENT_URL: z.string().min(1).default("http://localhost:3000"),
		DATABASE_URL: z.string().min(1),
		ENCRYPTION_PASSWORD: z.string().min(1),
		FIRECRAWL_API_KEY: z.string().min(1),
		MCP_OAUTH_ENVIRONMENT: z.enum(["live", "sandbox"]).default("sandbox"),
		PORT: z.coerce.number().int().positive().default(3099),
		SLACK_CLIENT_ID: z.string().min(1),
		SLACK_CLIENT_SECRET: z.string().min(1),
		SLACK_REDIRECT_URI: optionalString,
		SLACK_SIGNING_SECRET: z.string().min(1),
		SLACK_STATE_SECRET: optionalString,
	})
	.transform((values) => {
		const databaseUrl = new URL(values.DATABASE_URL);
		databaseUrl.pathname = "/chat";

		return {
			...values,
			BETTER_AUTH_URL:
				values.BETTER_AUTH_URL ??
				(process.env.NODE_ENV === "production"
					? "https://api.useautumn.com"
					: "http://localhost:8080"),
			CHAT_STATE_DATABASE_URL:
				values.CHAT_STATE_DATABASE_URL ?? databaseUrl.toString(),
			CHAT_STATE_SECRET:
				values.CHAT_STATE_SECRET ??
				values.SLACK_STATE_SECRET ??
				values.BETTER_AUTH_SECRET ??
				values.ENCRYPTION_PASSWORD,
		};
	});

export const env = envSchema.parse(process.env);
