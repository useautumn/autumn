import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { member } from "../../db/auth-schema";
import type * as schema from "../../db/schema";
import { ROLE_SCOPES, type Role, type ScopeString } from "../scopeDefinitions";

type ScopeResolverDb = Pick<
	PgDatabase<PgQueryResultHKT, typeof schema>,
	"query"
>;

const isCanonicalRole = (role: string): role is Role => role in ROLE_SCOPES;

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

	const { role } = membership;
	if (!isCanonicalRole(role)) {
		return { role, scopes: [] };
	}

	return { role, scopes: [...ROLE_SCOPES[role]] };
}
