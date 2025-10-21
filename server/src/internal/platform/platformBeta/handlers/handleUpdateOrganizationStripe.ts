import { AppEnv, type Organization, organizations } from "@autumn/shared";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { initPlatformStripe } from "@/external/connect/initStripeCli.js";
import { registerConnectWebhook } from "@/external/connect/registerConnectWebhook.js";
import { logger } from "@/external/logtail/logtailUtils.js";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";
import { validatePlatformOrg } from "../utils/validatePlatformOrg.js";

const UpdateOrganizationStripeSchema = z
	.object({
		organization_slug: z.string().min(1),
		test_account_id: z.string().optional(),
		live_account_id: z.string().optional(),
	})
	.refine(
		(data) => data.test_account_id || data.live_account_id,
		"At least one of test_account_id or live_account_id is required",
	);

/**
 * Validates that master org can access the Stripe account and updates the org's Stripe Connect config
 */
const validateAndUpdateStripeAccount = async ({
	accountId,
	env,
	masterOrg,
	org,
}: {
	accountId: string;
	env: AppEnv;
	masterOrg: Organization;
	org: Organization;
}) => {
	const stripeCli = initPlatformStripe({
		masterOrg,
		env,
		accountId,
	});

	const account = await stripeCli.accounts.retrieve(accountId);
	logger.info(`Stripe account ${account?.id} retrieved successfully`);

	// Update the organization's Stripe Connect configuration
	const currentConnect =
		env === AppEnv.Sandbox ? org.test_stripe_connect : org.live_stripe_connect;

	return {
		...currentConnect,
		account_id: accountId,
		master_org_id: masterOrg.id,
	};
};

/**
 * POST /organization/stripe
 * Updates Stripe Connect account for a platform organization
 * - Requires master org to have Stripe secret key connected
 * - Validates master org can access the account
 * - Stores master_org_id in the tenant org's stripe_connect config
 */
export const handleUpdateOrganizationStripe = createRoute({
	body: UpdateOrganizationStripeSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { db, org: masterOrg, logger } = ctx;

		const { organization_slug, test_account_id, live_account_id } =
			c.req.valid("json");

		// Verify the organization exists and was created by this master org
		const org = await validatePlatformOrg({
			db,
			organizationSlug: organization_slug,
			masterOrg,
		});

		// Validate and update Stripe accounts
		const updates: {
			test_stripe_connect?: any;
			live_stripe_connect?: any;
		} = {};

		if (test_account_id) {
			updates.test_stripe_connect = await validateAndUpdateStripeAccount({
				accountId: test_account_id,
				env: AppEnv.Sandbox,
				masterOrg,
				org,
			});
		}

		if (live_account_id) {
			updates.live_stripe_connect = await validateAndUpdateStripeAccount({
				accountId: live_account_id,
				env: AppEnv.Live,
				masterOrg,
				org,
			});
		}

		await db
			.update(organizations)
			.set(updates)
			.where(eq(organizations.id, org.id));

		// Clear organization cache
		await clearOrgCache({ db, orgId: org.id });

		logger.info(
			`Updated Stripe Connect for platform org ${org.slug}: test=${test_account_id}, live=${live_account_id}`,
		);

		await registerConnectWebhook({ ctx });

		return c.json({
			message: "Stripe Connect configuration updated successfully",
			organization: {
				id: org.id,
				slug: organization_slug,
			},
		});
	},
});
