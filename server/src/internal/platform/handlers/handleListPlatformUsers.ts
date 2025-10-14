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

		const shouldExpandOrgs = query.expand === "organizations";

		// 1. Get all users that have at least one organization created by ctx.org_id
		// We need to join through member -> organizations to find users with orgs created by master org
		const usersData = await db
			.selectDistinct({
				userId: userTable.id,
				userName: userTable.name,
				userEmail: userTable.email,
				userCreatedAt: userTable.createdAt,
			})
			.from(userTable)
			.innerJoin(member, eq(member.userId, userTable.id))
			.innerJoin(organizations, eq(organizations.id, member.organizationId))
			.where(eq(organizations.created_by, org.id))
			.limit(query.limit)
			.offset(query.offset);

		logger.info(`Found ${usersData.length} platform users`);

		// 2. If expand=organizations, fetch organizations for each user
		const userOrgsMap = new Map<string, ApiPlatformOrg[]>();

		if (shouldExpandOrgs && usersData.length > 0) {
			const userIds = usersData.map((u) => u.userId);

			// Fetch all organizations for these users that were created by master org
			const orgsData = await db
				.select({
					userId: member.userId,
					orgSlug: organizations.slug,
					orgName: organizations.name,
					orgCreatedAt: organizations.createdAt,
				})
				.from(organizations)
				.innerJoin(member, eq(member.organizationId, organizations.id))
				.where(
					and(
						eq(organizations.created_by, org.id),
						inArray(member.userId, userIds),
					),
				)
				.limit(100);

			// Group organizations by user
			for (const orgData of orgsData) {
				if (!userOrgsMap.has(orgData.userId)) {
					userOrgsMap.set(orgData.userId, []);
				}

				// Remove the master org slug prefix from the organization slug
				let cleanedSlug = orgData.orgSlug;
				const prefix = `${org.id}_`;
				if (cleanedSlug.startsWith(prefix)) {
					cleanedSlug = cleanedSlug.slice(prefix.length);
				}
				// Handle the case where slug is prepended with "slug_orgId"
				const altPrefix = `_${org.id}`;
				if (cleanedSlug.endsWith(altPrefix)) {
					cleanedSlug = cleanedSlug.slice(0, -altPrefix.length);
				}

				userOrgsMap.get(orgData.userId)?.push({
					slug: cleanedSlug,
					name: orgData.orgName,
					created_at: orgData.orgCreatedAt.toISOString(),
				});
			}
		}

		// 3. Build response
		const users: ApiPlatformUser[] = usersData.map((userData) => {
			const user: ApiPlatformUser = {
				name: userData.userName,
				email: userData.userEmail,
				created_at: userData.userCreatedAt.toISOString(),
			};

			if (shouldExpandOrgs) {
				user.organizations = userOrgsMap.get(userData.userId) || [];
			}

			return user;
		});

		return c.json({
			list: users,
			total: users.length,
			limit: query.limit,
			offset: query.offset,
		});
	},
});
