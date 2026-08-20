import { AppEnv } from "@autumn/shared";
import { defineMcpClientConnection } from "eve/connections";
import { getOrgInstallationToken } from "../../src/internal/installations/actions/getOrgInstallationToken.js";
import { approvalSets } from "./approvalSets.js";
import { type LeafAgentConnection, toolAllowlists } from "./toolAllowlists.js";

const appEnvFrom = (value: unknown): AppEnv =>
	value === AppEnv.Live ? AppEnv.Live : AppEnv.Sandbox;

const orgIdFrom = (value: unknown): string => {
	if (typeof value === "string" && value.length > 0) return value;
	throw new Error("Missing Leaf organization for Autumn MCP connection.");
};

const bareToolName = (toolName: string) =>
	toolName.split("__").pop() ?? toolName;

const stringAttr = (
	attributes: Record<string, unknown> | undefined,
	key: string,
): string | undefined => {
	const value = attributes?.[key];
	return typeof value === "string" && value.length > 0 ? value : undefined;
};

const descriptions: Record<LeafAgentConnection, string> = {
	billing:
		"Autumn billing tools: attach plans, update subscriptions, create schedules and balance grants, plus the customer and plan reads needed to build them.",
	catalog:
		"Autumn pricing catalog tools: create and update plans, features, and rewards, with catalog previews.",
	investigator:
		"Read-only Autumn tools: customers, entities, subscriptions, plans, rewards, and request logs.",
	orchestrator:
		"Autumn organization context: agent rules, plans, and features for routing work to specialists.",
	root: "Autumn billing platform tools for customers, plans, features, catalog setup, billing changes, balances, entities, request logs, and organization context.",
};

/** One Autumn MCP connection definition per agent: same server, same auth,
 * different discoverable tool surface and approval set. */
export const autumnConnection = ({ agent }: { agent: LeafAgentConnection }) => {
	const allow = toolAllowlists[agent];
	const approvalToolNames = approvalSets[agent];
	return defineMcpClientConnection({
		...(allow ? { tools: { allow: [...allow] } } : {}),
		url: new URL(
			"/mcp",
			process.env.CHAT_SERVER_URL ??
				`http://localhost:${process.env.CHAT_PORT ?? 3099}`,
		).href,
		description: descriptions[agent],
		approval: ({ toolName }) =>
			approvalToolNames.has(bareToolName(toolName))
				? "user-approval"
				: "not-applicable",
		auth: (_ctx) => ({
			principalType: "user",
			getToken: async ({ principal }) => {
				if (principal.type !== "user") {
					throw new Error("Autumn MCP requires a dashboard user.");
				}
				const attributes = principal.attributes;
				const orgId = orgIdFrom(attributes?.orgId);
				const appEnv = appEnvFrom(attributes?.appEnv);
				const provider = stringAttr(attributes, "provider") ?? "web";
				const workspaceId = stringAttr(attributes, "workspaceId") ?? orgId;
				const providerUserId =
					stringAttr(attributes, "providerUserId") ?? principal.id;
				// Credentials are keyed by Autumn user id. Web principals carry it as
				// providerUserId; Slack callers resolve it via email (autumnUserId) or
				// fall back to the installer's credential when unset.
				const credentialUserId =
					provider === "web"
						? providerUserId
						: stringAttr(attributes, "autumnUserId");
				const { accessToken } = await getOrgInstallationToken({
					env: appEnv,
					orgId,
					provider,
					workspaceId,
					userId: credentialUserId,
				});
				return { token: accessToken };
			},
		}),
		headers: (ctx) => ({
			"x-autumn-environment": appEnvFrom(
				ctx.session.auth.current?.attributes.appEnv,
			),
		}),
	});
};
