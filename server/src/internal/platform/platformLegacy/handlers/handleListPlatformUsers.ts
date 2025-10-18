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

/**
 * Route: GET /platform/users - List users created by master org
 */
export const listPlatformUsers = createRoute({
	query: ListPlatformUsersQuerySchema,
	handler: async (c) => {
		const query = c.req.valid("query") as ListPlatformUsersQuery;
		const ctx = c.get("ctx");

		const { db, org, logger } = ctx;

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
					organizations: user.organizations.map((org: any) => ({
						slug: cleanOrgSlug(org.slug, org.id),
						name: org.name,
						created_at: new Date(org.createdAt).getTime(),
					})),
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

/**
 * Remove master org ID prefix from organization slug
 */
function cleanOrgSlug(slug: string, orgId: string): string {
	let cleanedSlug = slug;
	const prefix = `${orgId}_`;
	if (cleanedSlug.startsWith(prefix)) {
		cleanedSlug = cleanedSlug.slice(prefix.length);
	}
	// Handle the case where slug is prepended with "slug_orgId"
	const altPrefix1 = `_${orgId}`;
	const altPrefix2 = `|${orgId}`;
	if (cleanedSlug.endsWith(altPrefix1)) {
		cleanedSlug = cleanedSlug.slice(0, -altPrefix1.length);
	} else if (cleanedSlug.endsWith(altPrefix2)) {
		cleanedSlug = cleanedSlug = cleanedSlug.slice(0, -altPrefix2.length);
	}
	return cleanedSlug;
}
