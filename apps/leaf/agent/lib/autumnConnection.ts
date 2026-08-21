import { defineMcpClientConnection } from "eve/connections";
import { approvalSets } from "./approvalSets.js";
import { appEnvFrom, mintAutumnAccessToken } from "./autumnAuth.js";
import { type LeafAgentConnection, toolAllowlists } from "./toolAllowlists.js";

const bareToolName = (toolName: string) =>
	toolName.split("__").pop() ?? toolName;

const descriptions: Record<LeafAgentConnection, string> = {
	billing:
		"Autumn billing tools: attach plans, update subscriptions, create schedules and balance grants, plus the customer and plan reads needed to build them.",
	catalog:
		"Autumn pricing catalog tools: create and update plans, features, and rewards, with catalog previews.",
	investigator:
		"Read-only Autumn tools: customers, entities, subscriptions, plans, rewards, and request logs.",
	orchestrator:
		"Autumn organization context and pricing catalog tools: agent rules, plans, features, catalog setup, and rewards.",
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
				const { accessToken } = await mintAutumnAccessToken({
					attributes: principal.attributes,
					principalId: principal.id,
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
