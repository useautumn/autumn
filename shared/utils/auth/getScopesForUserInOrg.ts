/**
 * Resolves the scope grant for a user within the given organisation.
 *
 * Queries the `member` table for the `(userId, organizationId)` row and maps the
 * stored role string onto the `ROLE_SCOPES` table. This is the single source of
 * truth shared by the dashboard session (server) and the Slack bot (leaf), so the
 * two can never drift on how a role becomes a scope set.
 *
 * Role names:
 *   Better-auth's stock organisation plugin ships with the built-in role names
 *   `"owner"`, `"admin"`, and `"member"`. Our canonical role vocabulary (`Role`)
 *   matches these names directly and adds `"developer"` and `"sales"`, so the
 *   stored role string maps onto `ROLE_SCOPES` keys without aliasing.
 *
 * If the stored role is not in `ROLE_SCOPES` we treat it as an unknown (legacy)
 * role, log a warning, and return an empty scope list. Callers get
 * `{ role, scopes: [] }` so they can still surface the role string to the client
 * without granting any permissions. A non-member resolves to
 * `{ role: null, scopes: [] }`.
 */

import type { SQL } from "drizzle-orm";
import { and, eq } from "drizzle-orm";
import { member } from "../../db/auth-schema";
import { ROLE_SCOPES, type Role, type ScopeString } from "../scopeDefinitions";

/**
 * Minimal structural shape of a Drizzle client needed to read a membership row.
 * Both the server (`node-postgres`) and leaf (`postgres-js`) clients satisfy it,
 * so neither package has to depend on the other's concrete db type.
 */
type ScopeResolverDb = {
	query: {
		member: {
			findFirst: (config: {
				where?: SQL;
			}) => Promise<{ role: string } | undefined | null>;
		};
	};
};

export async function getScopesForUserInOrg({
	db,
	userId,
	organizationId,
}: {
	db: ScopeResolverDb;
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
			`[getScopesForUserInOrg] Unknown role "${rawRole}" for user ${userId} ` +
				`in org ${organizationId}; granting no scopes.`,
		);
		return { role: rawRole, scopes: [] };
	}

	return {
		role: rawRole,
		scopes: [...ROLE_SCOPES[canonicalRole]],
	};
}
