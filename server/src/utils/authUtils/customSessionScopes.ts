/**
 * Resolves the scope grant for a user within the given organisation.
 *
 * Queries the `member` table for the `(userId, organizationId)` row and
 * maps the stored role string onto the `ROLE_SCOPES` table from
 * `@autumn/shared`.
 *
 * Role names:
 *   Better-auth's stock organisation plugin ships with the built-in role
 *   names `"owner"`, `"admin"`, and `"member"`. Our canonical role
 *   vocabulary (see `Role` in `@autumn/shared`) matches these names
 *   directly and adds `"developer"` and `"sales"`, so the stored role
 *   string maps onto `ROLE_SCOPES` keys without aliasing.
 *
 * If the stored role is not in `ROLE_SCOPES` we treat it as an unknown
 * (legacy) role, log a warning, and return an empty scope list. Callers
 * get `{ role, scopes: [] }` so they can still surface the role string to
 * the client without granting any permissions.
 */

import {
	member,
	ROLE_SCOPES,
	type Role,
	type ScopeString,
} from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/**
 * Returns the role string and the set of scopes granted to `userId` within
 * `organizationId`. If the user is not a member of the org, returns
 * `{ role: null, scopes: [] }`.
 */
export async function getScopesForUserInOrg({
	db,
	userId,
	organizationId,
}: {
	db: DrizzleCli;
	userId: string;
	organizationId: string;
}): Promise<{ role: string | null; scopes: ScopeString[] }> {
	const membership = await db.query.member.findFirst({
		where: and(
			eq(member.userId, userId),
			eq(member.organizationId, organizationId),
		),
	});

	if (!membership) {
		return { role: null, scopes: [] };
	}

	const rawRole = membership.role;
	const canonicalRole: Role | undefined =
		rawRole in ROLE_SCOPES ? (rawRole as Role) : undefined;

	if (!canonicalRole) {
		console.warn(
			`[customSessionScopes] Unknown role "${rawRole}" for user ${userId} ` +
				`in org ${organizationId}; granting no scopes.`,
		);
		return { role: rawRole, scopes: [] };
	}

	return {
		role: rawRole,
		scopes: [...ROLE_SCOPES[canonicalRole]],
	};
}
