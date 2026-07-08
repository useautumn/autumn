import { AppEnv } from "@autumn/shared";
import { defineMcpClientConnection } from "eve/connections";
import { getOrgInstallationToken } from "../../src/internal/installations/actions/getOrgInstallationToken.js";

const appEnvFrom = (value: unknown): AppEnv =>
	value === AppEnv.Live ? AppEnv.Live : AppEnv.Sandbox;

const orgIdFrom = (value: unknown): string => {
	if (typeof value === "string" && value.length > 0) return value;
	throw new Error("Missing Leaf organization for Autumn MCP connection.");
};

const approvalToolNames = new Set([
	"attach",
	"confirmBillingAction",
	"createBalance",
	"createEntity",
	"createPlan",
	"createSchedule",
	"updateAgentRules",
	"updateCatalog",
	"updateCustomer",
	"updatePlan",
	"updateSubscription",
]);

const bareToolName = (toolName: string) =>
	toolName.split("__").pop() ?? toolName;

const stringAttr = (
	attributes: Record<string, unknown> | undefined,
	key: string,
): string | undefined => {
	const value = attributes?.[key];
	return typeof value === "string" && value.length > 0 ? value : undefined;
};

export default defineMcpClientConnection({
	url: new URL(
		"/mcp",
		process.env.CHAT_SERVER_URL ??
			`http://localhost:${process.env.CHAT_PORT ?? 3099}`,
	).href,
	description:
		"Autumn billing platform tools for customers, plans, features, catalog setup, billing changes, balances, entities, request logs, and organization context.",
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
			const { accessToken } = await getOrgInstallationToken({
				env: appEnv,
				orgId,
				provider,
				workspaceId,
				userId: providerUserId,
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
