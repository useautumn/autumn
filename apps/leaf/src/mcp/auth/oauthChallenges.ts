import {
	getProtectedResourceMetadataUrl,
	getWwwAuthenticateHeader,
} from "@autumn/auth/oauth";
import { DEFAULT_OAUTH_RESOURCE_SCOPES } from "@autumn/shared";
import { OAuthHttpError } from "./protectedResourceMetadata.js";

/**
 * The transport cannot know which tool a session will reach, so every challenge
 * names the full advertised set and one step-up authorization covers them all.
 */
const buildChallenge = ({
	error,
	resourceUrl,
}: {
	error: string;
	resourceUrl: string;
}) =>
	getWwwAuthenticateHeader({
		error,
		resourceMetadataUrl: getProtectedResourceMetadataUrl({ resourceUrl }),
		scopes: DEFAULT_OAUTH_RESOURCE_SCOPES,
	});

/** RFC 6750 §3.1 401: the credential is missing, malformed, expired or wrong-audience. */
export const invalidTokenError = ({
	message,
	resourceUrl,
}: {
	message: string;
	resourceUrl: string;
}) =>
	new OAuthHttpError(
		401,
		message,
		"invalid_token",
		buildChallenge({ error: "invalid_token", resourceUrl }),
	);

/** RFC 6750 §3.1 403: the credential is valid but grants nothing this resource exposes. */
export const insufficientScopeError = ({
	message,
	resourceUrl,
}: {
	message: string;
	resourceUrl: string;
}) =>
	new OAuthHttpError(
		403,
		message,
		"insufficient_scope",
		buildChallenge({ error: "insufficient_scope", resourceUrl }),
	);
