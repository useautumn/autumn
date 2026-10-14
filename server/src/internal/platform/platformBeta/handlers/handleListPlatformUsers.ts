import {
	type ApiPlatformUser,
	type ListPlatformUsersQuery,
	ListPlatformUsersQuerySchema,
	member,
	organizations,
	user as userTable,
	Scopes,
} from "@autumn/shared";
import { eq } from "drizzle-orm";
import { cte } from "@/db/cteUtils/buildCte.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { toPlatformOrg } from "./platformOrgUtils.js";

export const listPlatformUsers = createRoute({
	scopes: [Scopes.Platform.Read],
	query: ListPlatformUsersQuerySchema,
	handler: async (c) => {
		const query = c.req.valid("query") as ListPlatformUsersQuery;
		const ctx = c.get("ctx");

		const { db, org } = ctx;

		const shouldExpandOrgs = query.expand?.includes("organizations");

		const usersCTE = cte({
			name: "platform_users",
			from: userTable,
			where: eq(userTable.createdBy, org.id),
			limit: query.limit,
			offset: query.offset,
			with: {
				organizations: cte({
					from: organizations,
					through: {
						table: member,
						from: eq(member.userId, userTable.id),
						to: eq(organizations.id, member.organizationId),
					},
					where: eq(organizations.created_by, org.id),
					limit: 100,
				}),
			},
		});

		const { data: results, count } = await usersCTE.execute({ db });

		const users: ApiPlatformUser[] = results.map((user) => ({
			email: user.email,
			created_at: new Date(user.created_at).getTime(),
			...(shouldExpandOrgs &&
				user.organizations && {
					organizations: user.organizations.map((org: any) =>
						toPlatformOrg({
							org: {
								slug: org.slug,
								name: org.name,
								createdAt: org.createdAt,
							},
							masterOrgId: ctx.org?.id || "",
						}),
					),
				}),
		}));

		return c.json({
			list: users,
			total: count,
			limit: query.limit,
			offset: query.offset,
		});
	},
});
