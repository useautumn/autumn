import { UNRESTRICTED_CHAT_OAUTH_CONSENT_KIND } from "@autumn/auth/oauth";
import { type ChatInstallation, oauthConsent } from "@autumn/shared";
import { ChatAuthMode } from "@autumn/shared/models/chatModels/chatEnums";
import { sql } from "drizzle-orm";
import { isSlackAdminProvider } from "../../slackAdmin/provider.js";

export const SLACK_ADMIN_CONSENT_KIND = "slack_admin";

export type OAuthConsentMetadata =
	| {
			kind: typeof SLACK_ADMIN_CONSENT_KIND;
			chatInstallationId: string;
			createdByUserId: string;
	  }
	| {
			kind: typeof UNRESTRICTED_CHAT_OAUTH_CONSENT_KIND;
			chatInstallationId: string;
			createdByUserId: string;
	  }
	| Record<string, never>;

export const getOAuthConsentMetadata = ({
	authMode,
	installation,
	userId,
}: {
	authMode?: ChatAuthMode;
	installation: ChatInstallation;
	userId: string;
}): OAuthConsentMetadata => {
	if (isSlackAdminProvider({ provider: installation.provider })) {
		return {
			kind: SLACK_ADMIN_CONSENT_KIND,
			chatInstallationId: installation.id,
			createdByUserId: userId,
		};
	}
	if (authMode === ChatAuthMode.Unrestricted) {
		return {
			kind: UNRESTRICTED_CHAT_OAUTH_CONSENT_KIND,
			chatInstallationId: installation.id,
			createdByUserId: userId,
		};
	}
	return {};
};

export const getOAuthConsentMetadataKindFilter = (
	metadata: OAuthConsentMetadata,
) => {
	const kind = "kind" in metadata ? metadata.kind : null;
	return kind
		? sql`${oauthConsent.metadata}->>'kind' = ${kind} AND ${oauthConsent.metadata}->>'chatInstallationId' = ${metadata.chatInstallationId} AND ${oauthConsent.metadata}->>'createdByUserId' = ${metadata.createdByUserId}`
		: sql`COALESCE(${oauthConsent.metadata}->>'kind', '') = ''`;
};
