import {
	AppEnv,
	customers,
	ErrCode,
	RecaseError,
	organizations,
	member,
} from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v4";
import type { Context } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import {
	deleteStripeAccounts,
	deleteSvixWebhooks,
	deleteStripeWebhooks,
} from "@/internal/orgs/orgUtils/deleteOrgUtils.js";

const deleteOrgSchema = z.object({
	slug: z.string().min(1, "Organization slug is required"),
});

/**
 * DELETE /organizations
 * Deletes a platform organization by slug (for test cleanup)
 */
export const handleDeletePlatformOrg = [
	zValidator("json", deleteOrgSchema),
	async (c: Context<HonoEnv>) => {
		const ctx = c.get("ctx");
		const { db, logger, org: masterOrg } = ctx;

		const { slug } = c.req.valid("json");

		// Platform API creates orgs with format: {slug}|{masterOrgId}
		// So we need to find the org with this pattern
		const fullSlug = `${slug}|${masterOrg.id}`;

		const org = await OrgService.getBySlug({ db, slug: fullSlug });
		if (!org) {
			throw new RecaseError({
				message: `Organization with slug "${slug}" not found`,
				code: ErrCode.NotFound,
				statusCode: 404,
			});
		}

		// Check if any live customers exist
		const hasCustomers = await db.query.customers.findFirst({
			where: and(eq(customers.org_id, org.id), eq(customers.env, AppEnv.Live)),
		});

		if (hasCustomers) {
			throw new RecaseError({
				message: "Cannot delete org with production mode customers",
				code: ErrCode.OrgHasCustomers,
				statusCode: 400,
			});
		}

		// Delete svix webhooks
		logger.info("1. Deleting svix webhooks");
		await deleteSvixWebhooks({ org, logger });

		// Delete stripe webhooks
		logger.info("2. Deleting stripe webhooks");
		await deleteStripeWebhooks({ org, logger });

		// Delete stripe accounts
		logger.info("3. Deleting stripe accounts");
		await deleteStripeAccounts({ org, logger });

		// Delete all sandbox customers
		logger.info("4. Deleting sandbox customers");
		await db
			.delete(customers)
			.where(
				and(eq(customers.org_id, org.id), eq(customers.env, AppEnv.Sandbox)),
			);

		// Delete memberships
		logger.info("5. Deleting org memberships");
		await db.delete(member).where(eq(member.organizationId, org.id));

		// Delete the organization itself
		logger.info("6. Deleting organization");
		await db.delete(organizations).where(eq(organizations.id, org.id));

		return c.json({
			success: true,
			message: `Organization "${slug}" deleted successfully`,
		});
	},
];
