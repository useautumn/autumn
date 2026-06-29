import {
	AppEnv,
	type ChatInstallation,
	type ChatOAuthCredential,
} from "@autumn/shared";
import { db } from "../../../lib/db.js";
import { getChatOAuthCredentialByInstallationEnv } from "../repos/chatOAuthCredentialsRepo.js";
import {
	replaceInstallationOAuthCredentials,
	resolveAgentScopes,
} from "./replaceInstallationOAuthCredentials.js";

// Re-mint a refresh token this far before it dies so a turn never races expiry.
const REFRESH_EXPIRY_SKEW_MS = 60 * 60 * 1000;

const scopeSetsEqual = (a: string[], b: string[]) => {
	if (a.length !== b.length) {
		return false;
	}
	const set = new Set(a);
	return b.every((scope) => set.has(scope));
};

/**
 * A per-user credential is stale (must be re-minted) when its refresh token has
 * expired, or the user's scopes no longer match what it was minted with (e.g. an
 * upgrade/downgrade, or a Slack role change).
 */
const isCredentialStale = ({
	credential,
	desiredScopes,
}: {
	credential: ChatOAuthCredential;
	desiredScopes: string[];
}) =>
	credential.refresh_token_expires_at == null ||
	credential.refresh_token_expires_at - REFRESH_EXPIRY_SKEW_MS <= Date.now() ||
	!scopeSetsEqual(credential.scopes, desiredScopes);

/**
 * Ensure a per-user MCP OAuth credential bound to `userScopes` exists for the
 * given installation, (re)minting it when missing, scope-changed, or its refresh
 * token is expiring. Shared by the web (dashboard) and Slack per-user flows so a
 * user's chat token never exceeds their resolved Autumn privileges.
 *
 * `userScopes` must be non-empty — `resolveAgentScopes` throws on `[]` rather than
 * fail open to the default set, so callers must deny unauthorized users first.
 */
export const ensureChatUserCredential = async ({
	installation,
	orgId,
	userId,
	userScopes,
}: {
	installation: ChatInstallation;
	orgId: string;
	userId: string;
	userScopes: string[];
}): Promise<void> => {
	const credential = await getChatOAuthCredentialByInstallationEnv({
		db,
		chatInstallationId: installation.id,
		env: AppEnv.Sandbox,
		orgId,
		userId,
	});
	const desiredScopes = resolveAgentScopes(userScopes);
	if (!credential || isCredentialStale({ credential, desiredScopes })) {
		await db.transaction((tx) =>
			replaceInstallationOAuthCredentials({
				tx,
				installation,
				userId,
				orgId,
				agentScopes: userScopes,
			}),
		);
	}
};
