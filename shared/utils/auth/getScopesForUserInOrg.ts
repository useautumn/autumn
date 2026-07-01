import type { SQL } from "drizzle-orm";
import { and, eq } from "drizzle-orm";
import { member } from "../../db/auth-schema";
import { ROLE_SCOPES, type Role, type ScopeString } from "../scopeDefinitions";

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
	const canonicalRole: Role | undefined = Object.prototype.hasOwnProperty.call(
		ROLE_SCOPES,
		rawRole,
	)
		? (rawRole as Role)
		: undefined;

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
