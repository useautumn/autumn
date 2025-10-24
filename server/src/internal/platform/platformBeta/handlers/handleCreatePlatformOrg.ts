import {
	AppEnv,
	member,
	type Organization,
	organizations,
	RecaseError,
	user as userTable,
} from "@autumn/shared";
import { generateId } from "better-auth";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { UserService } from "@/internal/auth/UserService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { afterOrgCreated } from "@/utils/authUtils/afterOrgCreated.js";
import { createKey } from "../../../dev/api-keys/apiKeyUtils.js";

const CreateOrganizationSchema = z.object({
	user_email: z.email(),
	name: z.string().min(1),
	slug: z.string().min(1),
	env: z.enum(["test", "live", "both"]).default("both"),
});

/**
 * Creates an organization for platform users
 * - Reuses existing users and organizations
 * - Creates test account via Stripe Connect
 * - Returns Autumn secret keys
 */
export const handleCreatePlatformOrg = createRoute({
	body: CreateOrganizationSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org: masterOrg, logger } = ctx;

		const { user_email, name, slug, env } = c.req.valid("json");

		// 1. Check if user with this email already exists, otherwise create
		let user = await UserService.getByEmail({
			db,
			email: user_email,
		});

		if (!user) {
			[user] = await db
				.insert(userTable)
				.values({
					id: generateId(),
					name: "",
					email: user_email,
					emailVerified: true,
					createdAt: new Date(),
					updatedAt: new Date(),
					role: "user",
					banned: false,
					banReason: null,
					banExpires: null,
					createdBy: masterOrg.id,
				})
				.returning();

			logger.info(`Created new user: ${user.id} (${user_email})`);
		} else {
			logger.info(
				`[Platform Beta] Found existing user with email: (${user_email})`,
			);
		}

		// 2. Check if organization with this slug exists (scoped to master org)
		const orgSlug = `${slug}|${masterOrg.id}`;
		const existingMembership = await db
			.select()
			.from(member)
			.innerJoin(organizations, eq(member.organizationId, organizations.id))
			.where(
				and(
					eq(member.userId, user.id),
					eq(member.role, "owner"),
					eq(organizations.slug, orgSlug),
					eq(organizations.created_by, masterOrg.id),
				),
			)
			.limit(1);

		const orgExists = await OrgService.getBySlug({
			db,
			slug: orgSlug,
		});

		if (orgExists && existingMembership.length === 0) {
			throw new RecaseError({
				message: `Organization with slug '${orgSlug}' already exists but ${user_email} is not a member`,
			});
		}

		let org: Organization & { master?: Organization | null };
		if (existingMembership.length === 0) {
			// Create new organization
			const orgId = generateId();

			console.log(`Creating new organization: ${orgId} (${orgSlug})`);

			const [insertedOrg] = await db
				.insert(organizations)
				.values({
					id: orgId,
					slug: orgSlug,
					name,
					logo: "",
					createdAt: new Date(),
					metadata: "",
					created_by: masterOrg.id,
				})
				.returning();

			org = { ...insertedOrg, master: masterOrg };

			// Create membership
			await db.insert(member).values({
				id: generateId(),
				organizationId: orgId,
				userId: user.id,
				role: "owner",
				createdAt: new Date(),
			});

			// Initialize org (creates default Stripe test account, svix apps, etc.)
			await afterOrgCreated({ org, user });

			logger.info(`Created new organization: ${org.id} (${orgSlug})`);
		} else {
			org = { ...existingMembership[0].organizations, master: masterOrg };
			logger.info(`Found existing organization: ${org.id} (${orgSlug})`);
		}

		// 3. Generate Autumn secret keys based on env
		let test_secret_key: string | undefined;
		let live_secret_key: string | undefined;

		if (env === "test" || env === "both") {
			test_secret_key = await createKey({
				db,
				orgId: org.id,
				env: AppEnv.Sandbox,
				name: "Platform API Key",
				prefix: "am_sk_test",
				meta: {},
			});
		}

		if (env === "live" || env === "both") {
			live_secret_key = await createKey({
				db,
				orgId: org.id,
				env: AppEnv.Live,
				name: "Platform API Key",
				prefix: "am_sk_live",
				meta: {},
			});
		}

		return c.json({
			test_secret_key,
			live_secret_key,
		});
	},
});
