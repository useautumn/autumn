import { canonicalizeOAuthResource } from "@autumn/auth/oauth";
import {
	getMcpOAuthResourceUrls,
	getOAuthValidAudiences,
} from "../oauthResourceAudiences.js";

/** RFC 8707 §2: the request named a resource this server does not serve. */
export class OAuthTokenResourceError extends Error {
	name = "OAuthTokenResourceError";
}

export const resolveOAuthTokenResource = ({
	grantResource,
	isMcpClient,
	requestResource,
}: {
	grantResource: string | null | undefined;
	isMcpClient: boolean;
	requestResource: string | null;
}): string | null => {
	if (grantResource) return canonicalizeOAuthResource(grantResource);
	if (!requestResource) return null;

	const resource = canonicalizeOAuthResource(requestResource);
	const audiences = isMcpClient
		? getMcpOAuthResourceUrls()
		: getOAuthValidAudiences();

	if (
		!resource ||
		!audiences.some(
			(audience) => canonicalizeOAuthResource(audience) === resource,
		)
	) {
		throw new OAuthTokenResourceError(
			`This authorization server issues no tokens for resource ${requestResource}`,
		);
	}

	return resource;
};
