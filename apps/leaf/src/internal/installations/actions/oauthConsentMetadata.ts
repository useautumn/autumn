import { UNRESTRICTED_CHAT_OAUTH_CONSENT_KIND } from "@autumn/auth/oauth";
import {
	ChatAuthMode,
	type ChatInstallation,
	oauthConsent,
} from "@autumn/shared";
import { sql } from "drizzle-orm";

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

const isSlackAdminProvider = ({ provider }: { provider: string }) =>
	provider === "slack_admin" || provider.startsWith("slack_admin:");

export const getOAuthConsentMetadata = ({
	authMode,
	installation,
	userId,
}: {
	authMode?: ChatAuthMode;
	installation: ChatInstallation;
	userId: string;
}): OAuthConsentMetadata =>
	isSlackAdminProvider({ provider: installation.provider })
		? {
				kind: SLACK_ADMIN_CONSENT_KIND,
				chatInstallationId: installation.id,
				createdByUserId: userId,
			}
		: authMode === ChatAuthMode.Unrestricted
			? {
					kind: UNRESTRICTED_CHAT_OAUTH_CONSENT_KIND,
					chatInstallationId: installation.id,
					createdByUserId: userId,
				}
			: {};

export const getOAuthConsentMetadataKindFilter = (
	metadata: OAuthConsentMetadata,
) => {
	const kind = "kind" in metadata ? metadata.kind : null;
	return kind
		? sql`${oauthConsent.metadata}->>'kind' = ${kind}`
		: sql`COALESCE(${oauthConsent.metadata}->>'kind', '') = ''`;
};
