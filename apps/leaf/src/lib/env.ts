import { getAutumnEnv } from "@autumn/env";
import { z } from "zod";

const optionalString = z.preprocess(
	(value) => (value === "" ? undefined : value),
	z.string().min(1).optional(),
);

const envSchema = z
	.object({
		MCP_SERVER_URL: optionalString,
		BETTER_AUTH_SECRET: optionalString,
		CHAT_NAME: z.string().min(1).default("Autumn"),
		CHAT_STATE_DATABASE_URL: optionalString,
		CHAT_STATE_SECRET: optionalString,
		CLIENT_URL: z.string().min(1).default("http://localhost:3000"),
		DATABASE_URL: z.string().min(1),
		ENCRYPTION_PASSWORD: z.string().min(1),
		// Kill switch for eve file ingestion (falls back to an honest "can't view
		// files" note) in case the upstream queue byte-corruption bug resurfaces.
		EVE_ATTACHMENTS_ENABLED: z
			.enum(["true", "false", "1", "0"])
			.default("true")
			.transform((value) => value === "true" || value === "1"),
		EVE_INTERNAL_AUTH_TOKEN: optionalString,
		EVE_SERVER_URL: z.string().url().default("http://127.0.0.1:3999"),
		MCP_OAUTH_ENVIRONMENT: z.enum(["live", "sandbox"]).default("sandbox"),
		PORT: z.coerce.number().int().positive().default(3099),
		SLACK_CLIENT_ID: z.string().min(1),
		SLACK_CLIENT_SECRET: z.string().min(1),
		SLACK_ADMIN_WORKSPACE_ID: optionalString,
		SLACK_REDIRECT_URI: optionalString,
		SLACK_SIGNING_SECRET: z.string().min(1),
		SLACK_STATE_SECRET: optionalString,
	})
	.transform((values) => {
		const databaseUrl = new URL(values.DATABASE_URL);
		databaseUrl.pathname = "/chat";

		return {
			...values,
			MCP_SERVER_URL:
				values.MCP_SERVER_URL ??
				(process.env.NODE_ENV === "production"
					? "https://mcp.useautumn.com/mcp"
					: `http://localhost:${values.PORT}`),
			// In-process MCP callers use loopback; MCP_SERVER_URL remains public.
			LOCAL_MCP_URL: `http://localhost:${values.PORT}`,
			CHAT_STATE_DATABASE_URL:
				values.CHAT_STATE_DATABASE_URL ?? databaseUrl.toString(),
			CHAT_STATE_SECRET:
				values.CHAT_STATE_SECRET ??
				values.SLACK_STATE_SECRET ??
				values.BETTER_AUTH_SECRET ??
				values.ENCRYPTION_PASSWORD,
			EVE_INTERNAL_AUTH_TOKEN:
				values.EVE_INTERNAL_AUTH_TOKEN ??
				values.CHAT_STATE_SECRET ??
				values.SLACK_STATE_SECRET ??
				values.BETTER_AUTH_SECRET ??
				values.ENCRYPTION_PASSWORD,
		};
	});

export const env = {
	...envSchema.parse(process.env),
	...getAutumnEnv(),
};
