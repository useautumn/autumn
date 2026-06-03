import { createHash } from "node:crypto";

/** Short, stable digest used to anonymise secrets inside principal ids. */
const hash = (value: string) =>
	createHash("sha256").update(value).digest("hex").slice(0, 32);

/**
 * Builds a principal id from a secret without leaking it, e.g.
 * `secret-key:<digest>`.
 */
export const principalFromSecret = ({
	kind,
	value,
}: {
	kind: string;
	value: string;
}) => `${kind}:${hash(value)}`;

type ExchangedIdentity = {
	orgId?: string | undefined;
	userId?: string | undefined;
	clientId?: string | undefined;
};

/**
 * Derives a principal id for an OAuth session. When the token exchange returned
 * an org we build a human-readable `oauth:<org>:<user>:<client>` id; otherwise we
 * fall back to a hashed token so unidentified callers still group consistently.
 */
export const getOAuthPrincipalId = ({
	token,
	exchanged,
}: {
	token: string;
	exchanged: ExchangedIdentity;
}) => {
	if (!exchanged.orgId) {
		return principalFromSecret({ kind: "oauth", value: token });
	}

	return [
		"oauth",
		exchanged.orgId,
		exchanged.userId ?? "unknown-user",
		exchanged.clientId ?? "unknown-client",
	].join(":");
};
