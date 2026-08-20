import { ms } from "@autumn/shared";
import type { ModelMessage } from "ai";
import { defineDynamic, defineTool } from "eve/tools";
import {
	type AutumnMcpToolMetadata,
	callAutumnMcpTool,
	listAutumnMcpTools,
} from "../../src/internal/autumnMcp/client.js";
import { approvalSets } from "./approvalSets.js";
import { mintAutumnAccessToken } from "./autumnAuth.js";
import { type LeafAgentConnection, toolAllowlists } from "./toolAllowlists.js";

const TOKEN_TTL_MS = ms.seconds(30);
const tokenCache = new Map<
	string,
	{
		expiresAt: number;
		minted: Promise<{ accessToken: string; appEnv: string }>;
	}
>();

const mintCached = (attributes: Record<string, unknown> | undefined) => {
	const key = JSON.stringify([
		attributes?.orgId,
		attributes?.appEnv,
		attributes?.provider,
		attributes?.autumnUserId,
		attributes?.providerUserId,
	]);
	const cached = tokenCache.get(key);
	if (cached && cached.expiresAt > Date.now()) return cached.minted;
	const minted = mintAutumnAccessToken({ attributes });
	tokenCache.set(key, { expiresAt: Date.now() + TOKEN_TTL_MS, minted });
	minted.catch(() => tokenCache.delete(key));
	return minted;
};

const metadataCache = new Map<string, Promise<AutumnMcpToolMetadata[]>>();

const leafMcpBaseUrl = () =>
	process.env.CHAT_SERVER_URL ??
	`http://localhost:${process.env.CHAT_PORT ?? 3099}`;

const toolMetadata = (env: string, token: string) => {
	const cached = metadataCache.get(env);
	if (cached) return cached;
	const listed = listAutumnMcpTools({
		baseUrl: leafMcpBaseUrl(),
		env: env as never,
		token,
	});
	metadataCache.set(env, listed);
	listed.catch(() => metadataCache.delete(env));
	return listed;
};

/** Names the framework's connection resolver already serves from a past
 * connection_search — re-registering them would be a name collision. */
const discoveredToolNames = (messages: readonly ModelMessage[]) => {
	const names = new Set<string>();
	for (const message of messages) {
		if (message.role !== "tool" || !Array.isArray(message.content)) continue;
		for (const part of message.content) {
			const result = part as {
				output?: unknown;
				toolName?: string;
				type?: string;
			};
			if (result.type !== "tool-result") continue;
			if (result.toolName !== "connection_search") continue;
			const output = result.output as { value?: unknown } | unknown[];
			const items = Array.isArray(output)
				? output
				: Array.isArray((output as { value?: unknown })?.value)
					? ((output as { value: unknown[] }).value ?? [])
					: [];
			for (const item of items) {
				const qualified = (item as { qualifiedName?: string }).qualifiedName;
				if (qualified) names.add(qualified);
			}
		}
	}
	return names;
};

const DESCRIPTION_DEPTH_MAX = 5;

/** Schema descriptions are ~half the tool-definition bytes the model
 * reprocesses every turn; below the request's own fields they add tokens,
 * not accuracy — the billing skill documents the deep shapes. Model-facing
 * only; the MCP wire is untouched. */
const slimSchema = (value: unknown, depth = 0): unknown => {
	if (Array.isArray(value)) {
		return value.map((entry) => slimSchema(entry, depth));
	}
	if (!value || typeof value !== "object") return value;
	const slimmed: Record<string, unknown> = {};
	for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
		if (key === "examples" || key === "title") continue;
		if (key === "description") {
			if (depth <= DESCRIPTION_DEPTH_MAX) slimmed[key] = entry;
			continue;
		}
		slimmed[key] = slimSchema(entry, depth + 1);
	}
	return slimmed;
};

/** Pre-registers the agent's allowlisted Autumn tools on every step with the
 * exact server schemas: the model never spends a turn on connection_search
 * and its ~90KB result never enters history. Approval gating matches the
 * connection's. */
export const autumnDirectTools = ({
	agent,
}: {
	agent: LeafAgentConnection;
}) => {
	const allowlist = new Set<string>(toolAllowlists[agent] ?? []);
	const approvalToolNames = approvalSets[agent];
	return defineDynamic({
		events: {
			"step.started": async (_event, ctx) => {
				const attributes = (ctx.session.auth.current?.attributes ??
					ctx.session.auth.initiator?.attributes) as
					| Record<string, unknown>
					| undefined;
				if (!attributes?.orgId) return null;
				const { accessToken, appEnv } = await mintCached(attributes);
				const metadata = await toolMetadata(appEnv, accessToken);
				const alreadyDiscovered = discoveredToolNames(ctx.messages);
				const entries: Record<string, unknown> = {};
				for (const tool of metadata) {
					if (!allowlist.has(tool.name)) continue;
					const qualified = `autumn__${tool.name}`;
					if (alreadyDiscovered.has(qualified)) continue;
					const toolName = tool.name;
					entries[qualified] = defineTool({
						approval: () =>
							approvalToolNames.has(toolName)
								? "user-approval"
								: "not-applicable",
						description: tool.description,
						execute: async (input, toolCtx) => {
							const minted = await mintCached(
								toolCtx.session.auth.current?.attributes as
									| Record<string, unknown>
									| undefined,
							);
							return callAutumnMcpTool({
								args: input as Record<string, unknown>,
								baseUrl: leafMcpBaseUrl(),
								env: minted.appEnv as never,
								token: minted.accessToken,
								toolName,
							});
						},
						inputSchema: slimSchema(tool.inputSchema) as { type: "object" },
					});
				}
				return entries as never;
			},
		},
	});
};
