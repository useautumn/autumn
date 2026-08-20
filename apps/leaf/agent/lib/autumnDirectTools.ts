import { type AppEnv, ms } from "@autumn/shared";
import type { ModelMessage } from "ai";
import { defineDynamic, defineTool } from "eve/tools";
import {
	type AutumnMcpToolMetadata,
	callAutumnMcpTool,
	type JsonSchemaObject,
	type JsonValue,
	listAutumnMcpTools,
} from "../../src/internal/autumnMcp/rpcClient.js";
import { createTtlCache } from "../../src/lib/ttlCache.js";
import { approvalSets } from "./approvalSets.js";
import {
	autumnPrincipalFrom,
	type LeafPrincipalAttributes,
	mintAutumnAccessToken,
} from "./autumnAuth.js";
import { type LeafAgentConnection, toolAllowlists } from "./toolAllowlists.js";

type MintedToken = Awaited<ReturnType<typeof mintAutumnAccessToken>>;

const tokenCache = createTtlCache<MintedToken>({ ttlMs: ms.seconds(30) });

/** "Minting" is a stored-credential lookup (2 DB reads, refresh only on
 * expiry); the principal is derived without I/O so the cache key costs
 * nothing and repeat steps skip the lookups entirely. */
const mintCachedToken = (attributes: LeafPrincipalAttributes | undefined) => {
	const principal = autumnPrincipalFrom({ attributes });
	return tokenCache.getOrCreate(
		[
			principal.orgId,
			principal.appEnv,
			principal.provider,
			principal.workspaceId,
			principal.credentialUserId ?? "",
		].join(":"),
		() => mintAutumnAccessToken({ attributes }),
	);
};

const metadataCache = createTtlCache<AutumnMcpToolMetadata[]>({
	ttlMs: ms.minutes(5),
});

const leafMcpBaseUrl = () =>
	process.env.CHAT_SERVER_URL ??
	`http://localhost:${process.env.CHAT_PORT ?? 3099}`;

const serverToolMetadata = ({
	appEnv,
	token,
}: {
	appEnv: AppEnv;
	token: string;
}) =>
	metadataCache.getOrCreate(appEnv, () =>
		listAutumnMcpTools({ baseUrl: leafMcpBaseUrl(), env: appEnv, token }),
	);

const DESCRIPTION_DEPTH_MAX = 5;

/** Schema descriptions are ~half the tool-definition bytes the model
 * reprocesses every turn; below the request's own fields they add tokens,
 * not accuracy — the billing skill documents the deep shapes. Model-facing
 * only; the MCP wire is untouched. */
const slimSchema = (value: JsonSchemaObject, depth = 0): JsonSchemaObject => {
	const slimmed: JsonSchemaObject = {};
	for (const [key, entry] of Object.entries(value)) {
		if (key === "examples" || key === "title") continue;
		if (key === "description") {
			if (depth <= DESCRIPTION_DEPTH_MAX) slimmed[key] = entry;
			continue;
		}
		slimmed[key] = slimSchemaValue(entry, depth + 1);
	}
	return slimmed;
};

const slimSchemaValue = (value: JsonValue, depth: number): JsonValue => {
	if (Array.isArray(value)) {
		return value.map((entry) => slimSchemaValue(entry, depth));
	}
	if (!value || typeof value !== "object") return value;
	return slimSchema(value, depth);
};

type ConnectionSearchItem = { qualifiedName?: string };

const searchResultItems = (output: unknown): ConnectionSearchItem[] => {
	if (Array.isArray(output)) return output as ConnectionSearchItem[];
	const value = (output as { value?: unknown } | undefined)?.value;
	return Array.isArray(value) ? (value as ConnectionSearchItem[]) : [];
};

/** Names the framework's connection resolver already serves from a past
 * connection_search — re-registering them would be a name collision. The
 * prompt says never to search, but a model that does must not crash the
 * step. */
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
			for (const item of searchResultItems(result.output)) {
				if (item.qualifiedName) names.add(item.qualifiedName);
			}
		}
	}
	return names;
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
					| LeafPrincipalAttributes
					| undefined;
				if (!attributes?.orgId) return null;
				const { accessToken, appEnv } = await mintCachedToken(attributes);
				const metadata = await serverToolMetadata({
					appEnv,
					token: accessToken,
				});
				const alreadyDiscovered = discoveredToolNames(ctx.messages);
				const entries: Record<string, ReturnType<typeof defineTool>> = {};
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
							const minted = await mintCachedToken(
								toolCtx.session.auth.current?.attributes,
							);
							return callAutumnMcpTool({
								args: input as Record<string, unknown>,
								baseUrl: leafMcpBaseUrl(),
								env: minted.appEnv,
								token: minted.accessToken,
								toolName,
							});
						},
						inputSchema: slimSchema(tool.inputSchema),
					});
				}
				return entries;
			},
		},
	});
};
