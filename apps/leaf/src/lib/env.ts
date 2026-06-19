import { z } from "zod";
import {
	DEFAULT_AGENT_HARNESS,
	DEFAULT_CHAT_MODEL,
	SANDBOX_PROVIDER,
} from "./chatAgentConfig.js";

const optionalString = z.preprocess(
	(value) => (value === "" ? undefined : value),
	z.string().min(1).optional(),
);

const envSchema = z
	.object({
		AGENT_HARNESS: z
			.enum(["mastra", "claude-managed", "vercel"])
			.default(DEFAULT_AGENT_HARNESS),
		ANTHROPIC_API_KEY: optionalString,
		// Vercel Sandbox auth for the "vercel" harness. Omit all three to fall
		// back to the ambient VERCEL_OIDC_TOKEN the SDK reads automatically.
		VERCEL_TOKEN: optionalString,
		VERCEL_TEAM_ID: optionalString,
		VERCEL_PROJECT_ID: optionalString,
		// Which sandbox the AI SDK harness runs inside; overrides SANDBOX_PROVIDER.
		SANDBOX_PROVIDER: z
			.enum(["vercel", "daytona", "e2b"])
			.default(SANDBOX_PROVIDER),
		// Bake the claude-code bridge into the E2B template so cold starts skip the
		// ~30s reinstall. On by default; set "false" to use a node+pnpm template with
		// a runtime bridge install instead.
		E2B_BAKE_BRIDGE: z
			.preprocess((value) => value !== "false" && value !== false, z.boolean())
			.default(true),
		// Daytona Sandbox auth for the "daytona" sandbox provider.
		DAYTONA_API_KEY: optionalString,
		DAYTONA_API_URL: optionalString,
		DAYTONA_TARGET: optionalString,
		DAYTONA_SANDBOX_IMAGE: optionalString,
		// Fork sessions from a cached template snapshot instead of reinstalling the
		// bridge each cold start. Off by default: needs a Daytona tier with headroom
		// for the build sandbox, and snapshot fork-by-name round-trip support.
		DAYTONA_USE_SNAPSHOT_TEMPLATE: z
			.preprocess((value) => value === "true" || value === true, z.boolean())
			.default(false),
		MCP_SERVER_URL: optionalString,
		BETTER_AUTH_SECRET: optionalString,
		BETTER_AUTH_URL: optionalString,
		CHAT_MODEL: z.string().min(1).default(DEFAULT_CHAT_MODEL),
		CHAT_NAME: z.string().min(1).default("Autumn"),
		CHAT_STATE_DATABASE_URL: optionalString,
		CHAT_STATE_SECRET: optionalString,
		CLIENT_URL: z.string().min(1).default("http://localhost:3000"),
		DATABASE_URL: z.string().min(1),
		E2B_API_KEY: optionalString,
		ENCRYPTION_PASSWORD: z.string().min(1),
		FIRECRAWL_API_KEY: z.string().min(1),
		MCP_OAUTH_ENVIRONMENT: z.enum(["live", "sandbox"]).default("sandbox"),
		PORT: z.coerce.number().int().positive().default(3099),
		SLACK_CLIENT_ID: z.string().min(1),
		SLACK_CLIENT_SECRET: z.string().min(1),
		SLACK_ADMIN_USER_IDS: optionalString,
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
