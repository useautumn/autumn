import {
	AppEnv,
	type ChatInstallation,
	type ChatOAuthCredential,
	ms,
} from "@autumn/shared";
import { db } from "../../../lib/db.js";
import { getChatOAuthCredentialByInstallationEnv } from "../repos/chatOAuthCredentialsRepo.js";
import {
	resolveAgentScopes,
	scopeSetsEqual,
} from "./chatOAuthCredentialScopes.js";
import { replaceInstallationOAuthCredentials } from "./replaceInstallationOAuthCredentials.js";

/** Re-mint a refresh token this far before it dies so a turn never races expiry. */
const REFRESH_EXPIRY_SKEW_MS = ms.hours(1);

/** Both envs are minted together and the consumed env is only known later, so both must stay fresh. */
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
