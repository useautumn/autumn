import { member, organizations } from "@autumn/shared";
import { asc, eq } from "drizzle-orm";
import type { Context } from "hono";
import { db } from "@/db/initDrizzle.js";
import { auth } from "@/utils/auth.js";

export const handleListAuthOrganizations = async (c: Context) => {
	const session = await auth.api.getSession({
		headers: c.req.raw.headers,
	});

	if (!session?.user?.id) {
		return c.json({ message: "Unauthorized" }, 401);
	}

	const orgs = await db
		.select({
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
		);

	return c.json(orgs);
};
