import {
	AppEnv,
	type ChatInstallation,
	type ChatOAuthCredential,
} from "@autumn/shared";
import { db } from "../../../lib/db.js";
import { getChatOAuthCredentialByInstallationEnv } from "../repos/chatOAuthCredentialsRepo.js";
import {
	resolveAgentScopes,
	scopeSetsEqual,
} from "./chatOAuthCredentialScopes.js";
import { replaceInstallationOAuthCredentials } from "./replaceInstallationOAuthCredentials.js";

// Re-mint a refresh token this far before it dies so a turn never races expiry.
const REFRESH_EXPIRY_SKEW_MS = 60 * 60 * 1000;

// The envs replaceInstallationOAuthCredentials always mints together. Which one a
// turn actually consumes is only resolved after this runs (Slack: the env
// selector; web: the app_env header), so every env's credential must be fresh —
// gating on a single env would let a stale/missing sibling slip through.
const CHAT_CREDENTIAL_ENVS = [AppEnv.Sandbox, AppEnv.Live] as const;

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
	const desiredScopes = resolveAgentScopes(userScopes);
	const credentials = await Promise.all(
		CHAT_CREDENTIAL_ENVS.map((env) =>
			getChatOAuthCredentialByInstallationEnv({
				db,
				chatInstallationId: installation.id,
				env,
				orgId,
				userId,
			}),
		),
	);
	const needsRemint = credentials.some(
		(credential) =>
			!credential || isCredentialStale({ credential, desiredScopes }),
	);
	if (needsRemint) {
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
