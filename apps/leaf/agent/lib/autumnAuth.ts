import { AppEnv } from "@autumn/shared";
import { getOrgInstallationToken } from "../../src/internal/installations/actions/getOrgInstallationToken.js";

export const appEnvFrom = (value: unknown): AppEnv =>
	value === AppEnv.Live ? AppEnv.Live : AppEnv.Sandbox;

const orgIdFrom = (value: unknown): string => {
	if (typeof value === "string" && value.length > 0) return value;
	throw new Error("Missing Leaf organization for Autumn MCP access.");
};

const stringAttr = (
	attributes: Record<string, unknown> | undefined,
	key: string,
): string | undefined => {
	const value = attributes?.[key];
	return typeof value === "string" && value.length > 0 ? value : undefined;
};

/** Mints the same Autumn access token the MCP connection would, from the
 * session principal's attributes. */
export const mintAutumnAccessToken = async ({
	attributes,
	principalId,
}: {
	attributes: Record<string, unknown> | undefined;
	principalId?: string;
}) => {
	const orgId = orgIdFrom(attributes?.orgId);
	const appEnv = appEnvFrom(attributes?.appEnv);
	const provider = stringAttr(attributes, "provider") ?? "web";
	const workspaceId = stringAttr(attributes, "workspaceId") ?? orgId;
	const providerUserId =
		stringAttr(attributes, "providerUserId") ?? principalId;
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
	return { accessToken, appEnv };
};
