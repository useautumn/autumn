import { canonicalizeOAuthResource } from "@autumn/auth/oauth";

/**
 * The refresh chain owns the audience: clients routinely omit `resource` on
 * refresh, and a rotated token must never widen or drop what it was granted.
 */
export const resolveOAuthTokenResource = ({
	refreshTokenRecord,
	requestResource,
}: {
	refreshTokenRecord: { resource: string | null } | null;
	requestResource: string | null;
}) =>
	canonicalizeOAuthResource(refreshTokenRecord?.resource ?? requestResource);
