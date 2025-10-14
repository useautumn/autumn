import {
	type ApiPlatformOrg,
	type ApiPlatformUser,
	type ListPlatformUsersQuery,
	ListPlatformUsersQuerySchema,
	member,
	organizations,
	user as userTable,
} from "@autumn/shared";
import { eq } from "drizzle-orm";
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

		// Build query with conditional joins
		let baseQuery = db
			.select({
				userId: userTable.id,
				userName: userTable.name,
				userEmail: userTable.email,
				userCreatedAt: userTable.createdAt,
				...(shouldExpandOrgs && {
					orgSlug: organizations.slug,
					orgName: organizations.name,
					orgCreatedAt: organizations.createdAt,
				}),
			})
			.from(userTable);

		// Conditionally add joins only when expanding orgs
		if (shouldExpandOrgs) {
			baseQuery = baseQuery
				.innerJoin(member, eq(member.userId, userTable.id))
				.innerJoin(
					organizations,
					eq(organizations.id, member.organizationId),
				) as typeof baseQuery;
		}

		// Apply filters and pagination
		const results = await baseQuery
			.where(
				shouldExpandOrgs
					? eq(organizations.created_by, org.id)
					: eq(userTable.createdBy, org.id),
			)
			.limit(query.limit)
			.offset(query.offset);

		logger.info(`Found ${results.length} platform users`);

		if (!shouldExpandOrgs) {
			// Simple case: just map users directly
			const users: ApiPlatformUser[] = results.map((userData) => ({
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

		// Complex case: group organizations by user
		const usersMap = new Map<
			string,
			{
				name: string;
				email: string;
				created_at: number;
				organizations: ApiPlatformOrg[];
			}
		>();

		for (const row of results) {
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
			if (userData.organizations.length < 100 && row.orgSlug) {
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
					name: row.orgName!,
					created_at: row.orgCreatedAt!.getTime(),
				});
			}
		}

		// Convert map to array
		const users: ApiPlatformUser[] = Array.from(usersMap.values());

		return c.json({
			list: users,
			total: users.length,
			limit: query.limit,
			offset: query.offset,
		});
	},
});
