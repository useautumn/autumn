import { AppEnv } from "@autumn/shared";
import { getOrgInstallationToken } from "../../src/internal/installations/actions/getOrgInstallationToken.js";

export type LeafPrincipalAttributes = Readonly<
	Record<string, string | readonly string[] | undefined>
>;

export const appEnvFrom = (value: unknown): AppEnv =>
	value === AppEnv.Live ? AppEnv.Live : AppEnv.Sandbox;

const orgIdFrom = (value: unknown): string => {
	if (typeof value === "string" && value.length > 0) return value;
	throw new Error("Missing Leaf organization for Autumn MCP access.");
};

const stringAttr = (
	attributes: LeafPrincipalAttributes | undefined,
	key: string,
): string | undefined => {
	const value = attributes?.[key];
	return typeof value === "string" && value.length > 0 ? value : undefined;
};

/** The stable identity behind a session principal — the fields token minting
 * (and its cache key) depend on. */
export const autumnPrincipalFrom = ({
	attributes,
	principalId,
}: {
	attributes: LeafPrincipalAttributes | undefined;
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
	return { appEnv, credentialUserId, orgId, provider, workspaceId };
};

/** Mints the same Autumn access token the MCP connection would, from the
 * session principal's attributes. */
export const mintAutumnAccessToken = async ({
	attributes,
	principalId,
}: {
	attributes: LeafPrincipalAttributes | undefined;
	principalId?: string;
}) => {
	const principal = autumnPrincipalFrom({ attributes, principalId });
	const { accessToken } = await getOrgInstallationToken({
		env: principal.appEnv,
		orgId: principal.orgId,
		provider: principal.provider,
		userId: principal.credentialUserId,
		workspaceId: principal.workspaceId,
	});
	return { accessToken, appEnv: principal.appEnv, principal };
};
