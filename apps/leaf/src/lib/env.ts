import { z } from "zod";
import {
	DEFAULT_CHAT_MODEL,
	DEFAULT_SLACK_AGENT_HARNESS,
	DEFAULT_WEB_AGENT_HARNESS,
} from "./chatAgentConfig.js";

const harnessSchema = z.enum(["mastra", "claude-managed"]);

const optionalString = z.preprocess(
	(value) => (value === "" ? undefined : value),
	z.string().min(1).optional(),
);

const envSchema = z
	.object({
		AGENT_HARNESS: harnessSchema.optional(),
		SLACK_AGENT_HARNESS: harnessSchema.optional(),
		WEB_AGENT_HARNESS: harnessSchema.optional(),
		ANTHROPIC_API_KEY: optionalString,
		MCP_SERVER_URL: optionalString,
		BETTER_AUTH_SECRET: optionalString,
		BETTER_AUTH_URL: optionalString,
		CHAT_MODEL: z.string().min(1).default(DEFAULT_CHAT_MODEL),
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
			AGENT_HARNESS: values.AGENT_HARNESS ?? DEFAULT_SLACK_AGENT_HARNESS,
			SLACK_AGENT_HARNESS:
				values.SLACK_AGENT_HARNESS ??
				values.AGENT_HARNESS ??
				DEFAULT_SLACK_AGENT_HARNESS,
			WEB_AGENT_HARNESS:
				values.WEB_AGENT_HARNESS ??
				values.AGENT_HARNESS ??
				DEFAULT_WEB_AGENT_HARNESS,
			MCP_SERVER_URL:
				values.MCP_SERVER_URL ??
				(process.env.NODE_ENV === "production"
					? "https://mcp.useautumn.com/mcp"
					: `http://localhost:${values.PORT}`),
			// In-process callers (mastra, tool context) hit leaf's own /mcp on
			// loopback — MCP_SERVER_URL is the public tunnel for Claude Managed Agents.
			LOCAL_MCP_URL: `http://localhost:${values.PORT}`,
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
