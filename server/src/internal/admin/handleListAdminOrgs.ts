import { member, organizations, user } from "@autumn/shared";
import { and, desc, eq, gt, gte, ilike, inArray, lt, or } from "drizzle-orm";
import { createRoute } from "../../honoMiddlewares/routeHandler";

export const handleListAdminOrgs = createRoute({
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db } = ctx;

		const { search, after: afterQuery, before: beforeQuery } = c.req.query();

		let after,
			before:
				| {
						id: string;
						createdAt: Date;
				  }
				| undefined;

		if (afterQuery) {
			after = {
				id: afterQuery.split(",")[0],
				createdAt: new Date(afterQuery.split(",")[1]),
			};
		} else if (beforeQuery) {
			before = {
				id: beforeQuery.split(",")[0],
				createdAt: new Date(beforeQuery.split(",")[1]),
			};
		}

		const orgs = await db
			.select()
			.from(organizations)
			.where(
				and(
					search
						? or(
								ilike(organizations.name, `%${search as string}%`),
								ilike(organizations.id, `%${search as string}%`),
								ilike(organizations.slug, `%${search as string}%`),
							)
						: undefined,
					after
						? or(
								lt(organizations.createdAt, after.createdAt),
								or(
									and(
										eq(organizations.createdAt, after.createdAt),
										lt(organizations.id, after.id),
									),
								),
							)
						: undefined,
					before
						? or(
								gte(organizations.createdAt, before.createdAt),
								or(
									and(
										eq(organizations.createdAt, before.createdAt),
										gt(organizations.id, before.id),
									),
								),
							)
						: undefined,
				),
			)
			.orderBy(desc(organizations.createdAt), desc(organizations.id))
			.limit(21);

		const orgIds = orgs.map((org) => org.id);

		const memberships = await db
			.select()
			.from(member)
			.leftJoin(user, eq(member.userId, user.id))
			.where(inArray(member.organizationId, orgIds));

		return c.json({
			rows: orgs.slice(0, 20).map((org) => ({
				...org,
				users: memberships
					.filter((membership) => membership.member.organizationId === org.id)
					.map((membership) => membership.user),
			})),
			hasNextPage: orgs.length > 20,
		});
	},
});
