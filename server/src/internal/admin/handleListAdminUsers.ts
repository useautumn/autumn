import { user } from "@autumn/shared";
import { and, desc, eq, gt, gte, ilike, lt, or } from "drizzle-orm";
import { createRoute } from "../../honoMiddlewares/routeHandler";

export const handleListAdminUsers = createRoute({
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

		const users = await db
			.select()
			.from(user)
			.where(
				and(
					search
						? or(
								ilike(user.email, `%${search as string}%`),
								ilike(user.name, `%${search as string}%`),
								ilike(user.id, `%${search as string}%`),
							)
						: undefined,
					after
						? or(
								lt(user.createdAt, after.createdAt),
								or(
									and(
										eq(user.createdAt, after.createdAt),
										lt(user.id, after.id),
									),
								),
							)
						: undefined,
					before
						? or(
								gte(user.createdAt, before.createdAt),
								or(
									and(
										eq(user.createdAt, before.createdAt),
										gt(user.id, before.id),
									),
								),
							)
						: undefined,
				),
			)
			.orderBy(desc(user.createdAt), desc(user.id))
			.limit(21);

		return c.json({
			rows: users.slice(0, 20),
			hasNextPage: users.length > 20,
		});
	},
});
