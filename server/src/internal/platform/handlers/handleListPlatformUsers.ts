import {
	type ApiPlatformOrg,
	type ApiPlatformUser,
	type ListPlatformUsersQuery,
	ListPlatformUsersQuerySchema,
	member,
	organizations,
	user as userTable,
} from "@autumn/shared";
import { and, eq, inArray } from "drizzle-orm";
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

		if (!shouldExpandOrgs) {
			// Simple case: just get users without organizations (no join needed)
			const usersData = await db
				.select({
					userId: userTable.id,
					userName: userTable.name,
					userEmail: userTable.email,
					userCreatedAt: userTable.createdAt,
				})
				.from(userTable)
				.where(eq(userTable.createdBy, org.id))
				.limit(query.limit)
				.offset(query.offset);

			logger.info(`Found ${usersData.length} platform users`);

			const users: ApiPlatformUser[] = usersData.map((userData) => ({
				name: userData.userName,
				email: userData.userEmail,
				created_at: userData.userCreatedAt.getTime(),
			}));

			return c.json({
				list: users,
				total: users.length,
				limit: query.limit,
				offset: query.offset,
			});
		}

		// Complex case: get users WITH their organizations
		// First, get the paginated user IDs (no join needed - users have created_by)
		const paginatedUsers = await db
			.select({
				userId: userTable.id,
			})
			.from(userTable)
			.where(eq(userTable.createdBy, org.id))
			.limit(query.limit)
			.offset(query.offset);

		if (paginatedUsers.length === 0) {
			return c.json({
				list: [],
				total: 0,
				limit: query.limit,
				offset: query.offset,
			});
		}

		const userIds = paginatedUsers.map((u) => u.userId);

		// Now fetch all user and org data in one query
		const allData = await db
			.select({
				userId: userTable.id,
				userName: userTable.name,
				userEmail: userTable.email,
				userCreatedAt: userTable.createdAt,
				orgSlug: organizations.slug,
				orgName: organizations.name,
				orgCreatedAt: organizations.createdAt,
			})
			.from(userTable)
			.innerJoin(member, eq(member.userId, userTable.id))
			.innerJoin(organizations, eq(organizations.id, member.organizationId))
			.where(
				and(
					eq(organizations.created_by, org.id),
					inArray(userTable.id, userIds),
				),
			);

		logger.info(`Found ${allData.length} user-org relationships`);

		// Group data by user
		const usersMap = new Map<
			string,
			{
				name: string;
				email: string;
				created_at: number;
				organizations: ApiPlatformOrg[];
			}
		>();

		for (const row of allData) {
			if (!usersMap.has(row.userId)) {
				usersMap.set(row.userId, {
					name: row.userName,
					email: row.userEmail,
					created_at: row.userCreatedAt.getTime(),
					organizations: [],
				});
			}

			const userData = usersMap.get(row.userId)!;

			// Limit to 100 organizations per user
			if (userData.organizations.length < 100) {
				// Remove the master org slug prefix from the organization slug
				let cleanedSlug = row.orgSlug;
				const prefix = `${org.id}_`;
				if (cleanedSlug.startsWith(prefix)) {
					cleanedSlug = cleanedSlug.slice(prefix.length);
				}
				// Handle the case where slug is prepended with "slug_orgId"
				const altPrefix = `_${org.id}`;
				if (cleanedSlug.endsWith(altPrefix)) {
					cleanedSlug = cleanedSlug.slice(0, -altPrefix.length);
				}

				userData.organizations.push({
					slug: cleanedSlug,
					name: row.orgName,
					created_at: row.orgCreatedAt.getTime(),
				});
			}
		}

		// Convert map to array, preserving pagination order
		const users: ApiPlatformUser[] = userIds
			.map((userId) => usersMap.get(userId))
			.filter((user): user is NonNullable<typeof user> => user !== undefined);

		return c.json({
			list: users,
			total: users.length,
			limit: query.limit,
			offset: query.offset,
		});
	},
});
