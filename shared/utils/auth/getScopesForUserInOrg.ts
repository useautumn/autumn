import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { member } from "../../db/auth-schema";
import type * as schema from "../../db/schema";
import { ROLE_SCOPES, type Role, type ScopeString } from "../scopeDefinitions";

/** Any drizzle db over the shared schema; server's instrumented db overrides `execute`. */
type ScopeResolverDb = Pick<
	PgDatabase<PgQueryResultHKT, typeof schema>,
	"query"
>;

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
	const canonicalRole = (Object.keys(ROLE_SCOPES) as Role[]).find(
		(role) => role === rawRole,
	);

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
