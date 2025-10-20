import {
	type ApiPlatformUser,
	type ListPlatformUsersQuery,
	ListPlatformUsersQuerySchema,
	member,
	organizations,
	user as userTable,
} from "@autumn/shared";
import { eq } from "drizzle-orm";
import { cte } from "@/db/cteUtils/buildCte.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { toPlatformOrg } from "./platformOrgUtils.js";

/**
 * Route: GET /platform/users - List users created by master org
 */
export const listPlatformUsers = createRoute({
	query: ListPlatformUsersQuerySchema,
	handler: async (c) => {
		const query = c.req.valid("query") as ListPlatformUsersQuery;
		const ctx = c.get("ctx");

		const { db, org } = ctx;

		const shouldExpandOrgs = query.expand?.includes("organizations");

		// Build CTE for users with optional organizations
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

		// Execute the CTE
		const { data: results, count } = await usersCTE.execute({ db });

		// Map results to API format
		const users: ApiPlatformUser[] = results.map((user) => ({
			// name: user.name,
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
