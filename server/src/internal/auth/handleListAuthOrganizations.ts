import { ErrCode, member, organizations, RecaseError } from "@autumn/shared";
import { asc, eq } from "drizzle-orm";
import type { Context } from "hono";
import { db } from "@/db/initDrizzle.js";
import { auth } from "@/utils/auth.js";

const AUTH_ORGANIZATION_LIST_LIMIT = 1000;

export const handleListAuthOrganizations = async (c: Context) => {
	const session = await auth.api.getSession({
		headers: c.req.raw.headers,
	});

	if (!session?.user?.id) {
		throw new RecaseError({
			message: "Unauthorized - no session found",
			code: ErrCode.NoAuthHeader,
			statusCode: 401,
		});
	}

	const orgs = await db
		.selectDistinct({
			id: organizations.id,
			name: organizations.name,
			slug: organizations.slug,
			logo: organizations.logo,
			createdAt: organizations.createdAt,
			metadata: organizations.metadata,
		})
		.from(member)
		.innerJoin(organizations, eq(member.organizationId, organizations.id))
		.where(eq(member.userId, session.user.id))
		.orderBy(
			asc(organizations.name),
			asc(organizations.slug),
			asc(organizations.id),
		)
		.limit(AUTH_ORGANIZATION_LIST_LIMIT);

	return c.json(orgs);
};
