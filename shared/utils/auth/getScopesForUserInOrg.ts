import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { member, organizationRole } from "../../db/auth-schema";
import type * as schema from "../../db/schema";
import { roleAccessToScopes } from "../roleUtils/roleAccessToScopes";
import { ROLE_SCOPES, type Role, type ScopeString } from "../scopeDefinitions";

/** Any drizzle db over the shared schema; server's instrumented db overrides `execute`. */
type ScopeResolverDb = Pick<
	PgDatabase<PgQueryResultHKT, typeof schema>,
	"select"
>;

// Own keys only: `in` would also match inherited names like "constructor".
const isCanonicalRole = (role: string): role is Role =>
	Object.hasOwn(ROLE_SCOPES, role);

/** Custom roles grant their stored access; unknown roles keep their name but grant no scopes. */
export async function getScopesForUserInOrg({
	db,
	userId,
	organizationId,
}: {
	db: ScopeResolverDb;
	userId: string;
	organizationId: string;
}): Promise<{ role: string | null; scopes: ScopeString[] }> {
	// One statement, so a concurrent role rename can't leave the member's role unresolved.
	const [membership] = await db
		.select({ role: member.role, customAccess: organizationRole.access })
		.from(member)
		.leftJoin(
			organizationRole,
			and(
				eq(organizationRole.organizationId, member.organizationId),
				eq(organizationRole.role, member.role),
			),
		)
		.where(
			and(eq(member.userId, userId), eq(member.organizationId, organizationId)),
		)
		.limit(1);

	if (!membership) {
		return { role: null, scopes: [] };
	}

	const { role, customAccess } = membership;
	if (isCanonicalRole(role)) {
		return { role, scopes: [...ROLE_SCOPES[role]] };
	}
	if (!customAccess) {
		return { role, scopes: [] };
	}

	return { role, scopes: roleAccessToScopes({ access: customAccess }) };
}
